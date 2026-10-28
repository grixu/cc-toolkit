# Two always-on lenses, coherence and assumptions, judge evidence no other lens reads

Status: accepted

Amends 0002's lens set and counts. Two families get their own always-on lenses, rules files
and scanners: `coherence` (eight rules: doc-drift, contract-drift, schema-drift,
config-drift, sibling-asymmetry, missing-counterpart, incomplete-propagation,
invariant-breach) and `assumptions` (four rules: dependency-semantics, platform-semantics,
version-skew, mock-divergence). Both grade `high` or `medium` only, like `correctness`,
`security` and `spec`. With them the plugin has eleven lenses, thirteen fixed families and
68 fixed severity rows; `standards` stays the fourteenth family label, with no fixed rows.

0002 folded the proposed architecture, structural and code-smell scanners into existing
families because their rules overlapped those families' rules. These two do not fold,
because each needs evidence no existing lens reads:

- **`coherence` judges a seam, not a file.** Every finding quotes two artifacts against
  each other, `pathA:L` vs `pathB:L` — a README against the CLI, an OpenAPI enum against
  the handler, a migration against the model, a compose key against the code that reads
  it. One side is often a file every other lens skips (Markdown, YAML, `.env.example`,
  `.sql`, a workflow), so its `<files>` is the resolved list plus every skipped file except
  lockfiles, generated output and real `.env*` files (templates such as `.env.example`
  stay; a real one is Grepped for key names only, never Read), minus the active spec.
- **`assumptions` judges a belief against installed source.** A finding pins the
  dependency's version from the lockfile and cites the installed implementation
  (`node_modules/…:L`, `site-packages`, `vendor/`), its own docs, or the platform's
  documented behaviour, then names the input and outcome on the changed path. No other lens
  reads third-party source or CI and runtime semantics.

**Overlap boundaries.** Each is written into both rules files it touches and into the merge
contract's dedup rules:

- two declarations the type checker connects are `correctness` · contract-mismatch; YAML,
  proto, SDL vs code, a hand-copied type or a separate service is `coherence` ·
  contract-drift;
- comment text inside a source file is `comments` R9; any other prose is `doc-drift`,
  except the active spec, which is `spec`'s alone;
- import arrows are `module` · dependency-direction and a `CODING_STANDARDS` rule is
  `standards`, even when an ADR states them; `invariant-breach` covers every other invariant;
- wider trust, an exposed secret or a missing or weaker authorization check is a `HANDOFF`
  to `security`; a broken deploy or a name mismatch stays `coherence`;
- a setup/teardown pair inside one function is `patterns` · execute-around; a paired
  operation missing across units is `missing-counterpart`;
- missing handling for a declared or universal outcome is `correctness`; a false belief
  about third-party, runtime or platform internals is `assumptions`;
- a test whose name or fixture claims an unchecked boundary is `tests` · test-fidelity; a
  double that encodes behaviour the real dependency lacks is `mock-divergence`.

**Who may state an invariant.** An accepted ADR, `CONTEXT.md`, and a decision document
inside the diff generate `invariant-breach` findings, each quoting its rule. Any other
design note or plan yields a `CANDIDATE` marked "intent unconfirmed". `CLAUDE.md`,
`AGENTS.md`, `CONTRIBUTING.md` and `.claude/rules` stay suppress-only, as 0002 set for every
lens: a convention file the author writes for an agent is not a decision record.

**A docs-only change runs `coherence`.** When every file is skipped — documents,
changesets, config data — `coherence` is the one active lens (plus `spec` when one is
active) and reads the code side of each claim from the repository. A policy-only change
runs `security`, `assumptions` and `coherence`.

**Two rules fold into existing lenses instead of getting scanners.** `tests` ·
mutation-gap (medium) flags a decision the change adds or modifies that the unit's tests
exercise but would still pass if inverted, shifted by one or deleted; it sits in the
readability & tests lens because the evidence is the unit's own tests. The Code Auditor
patterns — an async callback in `forEach`, a fire-and-forget promise, an `allSettled`
entry read without its status, `.find()` used as present, an unguarded `JSON.parse`, an
unchecked HTTP status, a missing timeout, a retried non-idempotent call, a dropped error
cause, `.sort()` on a parameter, a loose `==` — become Flag conditions on the existing
`correctness` rules, each with the look-alike that clears it; a pattern alone is never a
finding without its input and outcome. Neither adds a lens.

**fd3's repair review keeps `REPAIR_LENSES = ['correctness', 'security']`.** A repair is
a few lines a human decided; it adds no document, contract or dependency use for
`coherence` or `assumptions` to judge, and the full review already ran both lenses on the
branch. fd3's `cr-merge` result schema accepts both families.

## Evidence

A/B on seven open pull requests of a private TypeScript monorepo, Opus 5.5, k=3 per arm,
baseline the previous nine-lens release. Five carry ground truth from human and bot review
comments, two reviewed at two commits: nine targets, 41 valid defects. Two controls expect
no findings. A blind LLM judge scored against a fixed rubric; re-judging agreed on 93%.

| Criterion | Baseline | Treatment |
| --- | --- | --- |
| `coherence`-category recall | 0/21 | 10/21 (0.48); precision 0.91 (39/43) |
| `assumptions`-category | 11/24 hit, 0 primary | precision 1.00 (11/11), recall 10/27 primary |
| `correctness` with auditor patterns | precision 1.00, 11/39 hit | precision 1.00, 9–10/39 hit |
| `tests` · mutation-gap precision | — | 0.98 (40/41), one bullet per unit |
| `tests` · test-fidelity real findings | 4 | 8 |
| Controls, false high/medium | 1 | 0 |
| Cost per review | — | +40% |

- `coherence` also found about ten real defects no reviewer had raised. Its recall is capped
  by coverage on very large changes: it judged 27–66 of 90–127 files.
- `assumptions` precision rose from 0.50 to 1.00 once a belief with no backing became a
  candidate; pa11y- and undici-class defects came out primary in every trial. It
  still clears some CI, compose and orchestrator beliefs without evidence.
- The auditor patterns bought `correctness` no measurable recall; 7 of its 11 hand-offs to
  `assumptions` were correct.
- The merge still demotes or rejects some lens findings that match ground truth — earlier
  behaviour, outside this decision.
- The bars set before the test — `coherence` recall ≥ 0.6, `correctness` +2 items — were not
  met. Both lenses ship by explicit decision: baseline `coherence` recall was 0 and precision
  held. The +40% cost, about $1.4–1.5 per always-on lens per run, is accepted.

## Considered Options

- **Fold `coherence` into `comments`, `spec` or `correctness`** — rejected: `comments`
  judges comment text inside a source file, `spec` judges the change against one named
  document, and `correctness` judges what the type checker or an in-repo declaration
  states. None reads the skipped files that hold one side of the seam.
- **Fold `assumptions` into `correctness`** — rejected: `correctness` needs no evidence
  beyond the repository, while a false belief about a library needs a pinned version and
  the installed source; mixing the two makes the cheaper lens pay the dependency read on
  every change.
- **Gate either lens on file kinds** — rejected: a one-line change can rename a key a
  workflow still sets, or rely on a library default. Each is inactive only when its own
  `<files>` is empty.
- **Let `CLAUDE.md`, `AGENTS.md` or `.claude/rules` state invariants** — rejected: they
  hold agent instructions and house style, not ratified decisions; letting them generate
  would turn every instruction file into a rule source.
- **A separate mutation-testing lens** — rejected: the rule needs only the unit's tests and
  one hop of Grep, it never runs mutants, and its fix lands in a test file the tests lens
  already judges.

## Consequences

- Every count in the plugin is N, the active lens count, or one stated in this record:
  eleven lenses, nine of them always on, so a change with executable source and a named
  spec runs eleven scanners and the tally reads `L of 11`.
- Both lenses are always on, so every review pays two more scanner start-ups and two more
  outputs to merge.
- `coherence` and `assumptions` fixes are structural or report-only, never safe: rewriting
  a doc to match code can hide a code bug, and a dependency bump or a platform setting
  outside the repo is the author's call.
- `assumptions` depends on an installed dependency tree; a worktree with none falls back
  to the primary worktree's install at the same locked version, then to `(verify)`.

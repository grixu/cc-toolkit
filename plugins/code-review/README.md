# code-review

code-review is a Claude Code plugin that reviews a code change with up to eleven focused reviewers
running in parallel, then merges what they find into one report grouped by file. After the report,
a short menu asks which fixes to apply. Nothing is edited until you choose.

## Why not just ask Claude to review?

A single "review this" prompt reads the change once, from one angle, and decides on the fly what
counts as a problem. This plugin instead:

- runs one reviewer per lens in parallel, each with its own written rule set (68 named rules plus
  12 comment rules), so every finding names its rule and runs are comparable;
- merges the findings centrally: duplicates collapse, and severities follow one fixed table;
- reads your project's conventions first, so a documented house style is not reported as a
  problem, and turns explicit rules in `CODING_STANDARDS.md` into findings;
- ends with an apply menu sorted by risk, and edits only what you select.

It reviews how code reads and is structured, whether it does what it evidently means to do,
whether the change agrees with its own docs, contracts and config, and whether it relies on
behaviour its dependencies or platform do not have, plus narrow security, performance and spec
checks. Claude Code's bundled `/code-review` skill shares
this plugin's name; it is a single bug-hunting pass, where this plugin grades every finding
against a fixed rule.

## Install

```
/plugin marketplace add grixu/cc-toolkit
/plugin install code-review@cc-toolkit
```

## Requirements

- `git`. The change under review is read from git.
- `python3`. A bundled script finds the changed files and the base branch.
- The `Agent` tool in your session. `/code-review:start-cr` runs its reviewers as sub-agents. Where
  that tool is missing, such as inside another agent or a workflow step, it says so first instead
  of passing off a single read as a full review.

## Quick start

Plugin commands carry the plugin's name as a prefix:

```
/code-review:start-cr                          # review the current branch's changes
/code-review:start-cr src/auth.ts src/billing/ # review these files or directories in full
/code-review:start-cr --base develop           # measure the change against develop
/code-review:start-cr --spec docs/feature.md   # also check the change against a local spec
/code-review:start-cr --pr 42                   # review GitHub pull request #42 against its base
```

With no paths, it reviews your branch's changes. It finds the base branch in this order: the
upstream branch, `origin/main`, `origin/master`, `main`, `master`, unless you pass `--base`. It sees
committed, uncommitted and untracked files. When you have both committed and uncommitted changes, it
asks whether to review the uncommitted ones, the committed ones, or both. When it finds nothing but
another base would show commits, as with a branch pushed to its own remote counterpart, it offers to
run again against that base.

With `--pr <number>` it reviews a GitHub pull request's head against the PR's base, using `gh`.
When your checkout is not at the PR's head, it reviews and applies fixes in a detached worktree
next to the repository, and your checkout is never switched. When someone else authored the pull
request, it applies nothing: every finding is anchored to a line of the diff, a draft review in
English labels each one with a [Conventional Comments](https://conventionalcomments.org/) label
(`issue:`, `suggestion:`, `nitpick:`), and one question asks whether to post the draft as a single
comment review or keep it.

## The lenses

You do not pick lenses; the change decides. Nine run on any change of code, two depend on the
input, and the report's tally lists any lens that did not run and why. A change of documents,
changesets or config data alone runs coherence only, which reads the code each claim describes
from the repository.

| Lens | Runs | Looks for |
|---|---|---|
| comments | always | Comments that narrate the code, cite tickets or other files, contradict the code, or are missing where a decision needs explaining. |
| readability & tests | always | Nesting a guard clause would flatten, unnamed magic values, functions doing several jobs, tests that do not check what their name claims. |
| naming & module | always | Names that hide intent, queries that change state, imports pointing the wrong way, helpers that duplicate one the repository already has, wrappers that only forward a call. |
| objects & patterns | always, except on a change of infrastructure code only | Half-built objects, exposed internal collections, methods living on the wrong object, repeated type switches. |
| simplicity & types | always | Duplication that collapses into one shape, code longer than its idea, needless casts, dead code. |
| correctness | always | Conditions that pick the wrong branch, cases nothing handles, off-by-one bounds, swallowed errors, races on shared state, calls that break their callee's contract. |
| security | always | Secrets in source, injection, missing access checks, unvalidated input, insecure settings, exposed infrastructure, widened access, including in access policies, RBAC, `CODEOWNERS` and CI workflows. |
| coherence | always | Two artifacts that describe the same thing differently: docs or a changeset stating what the code does not do, an API contract or migration out of step with the code, a config key the code reads that compose, Helm or a workflow does not set, one of several parallel paths skipping a shared step, a new enum member a sibling listing misses, code breaking a rule an accepted ADR or `CONTEXT.md` states. |
| assumptions | always | Code that relies on a library, runtime, CI or platform behaving in a way it does not: an option's real scope or default, an API the locked version lacks, a job reading a secret its environment does not grant, a test double the real dependency would not match. |
| performance | the change includes executable source (not tests, test helpers, `*.config.*`, infrastructure code or `.sh`) | N+1 calls, unbounded fetches, blocking calls on async paths, wasted React renders, queries on unindexed columns. |
| spec | you name a spec with `--spec`, or accept the one the change carries | Spec lines nothing implements, implemented wrongly or only partly, and behaviour the spec never asked for. |

A security finding names where untrusted data enters and where it lands; a performance finding
names the loop, the call inside it, and the batch or limit API that exists; a correctness finding
names the input that takes the wrong path and what happens to it. A coherence finding quotes both
artifacts, each with its `path:line`, and what breaks between them. An assumptions finding names
the belief, the fact that contradicts it with its source (the dependency's installed code at the
version the lockfile pins, its own docs, or the platform's documented behaviour), and the input
and outcome on the changed path. A pattern alone is not a finding.

When the change itself contains a spec-shaped Markdown file (under `specs/`, `spec/`, `docs/adr/`
or `tasks/`, or named `*SPEC*.md`, `*ADR*.md`, `*.spec.md` or `*-plan.md`) and you passed no
`--spec`, the review offers to check the change against it, preferring a spec over an ADR. When the
change carries none, it looks for a `SPEC.md` already in the repository that matches the branch's
name, then in the main worktree for a `SPEC.split.md` or task file that names the branch, and
offers the `SPEC.md` beside it. `--spec` takes a local file only. For a URL or a
ticket id, the review asks for a local path; it never fetches one.

## What you get

A report grouped by file. Code findings read `` `family` · rule · severity ``, where severity is
`high`, `medium` or `nit`. Comment findings read `` `comments` · R1–R12 · verdict ``, where the
verdict is one of:

- KEEP: the comment stays.
- REMOVE: delete it.
- REWRITE: replace it; the report gives the exact text.
- MOVE: move it to where the behaviour it explains lives.
- ADD: a missing comment that explains a decision.

An example report:

```markdown
## Code review — committed (base → HEAD), 3 files

**Conventions:** repo `CLAUDE.md` documents barrel exports as the public-API style, so `module` · barrel is not flagged here.
**Headline:** `checkout/total.ts` concatenates the request's coupon code into a raw SQL string at L72.

### src/checkout/total.ts
- `security` · injection-sink · high · L70, L72 — `couponCode` read from `req.query` at L70 reaches the raw `WHERE` string at L72 by concatenation → bind it as a query parameter
- `simplicity` · over-complex · high · L18, L34, L51 — three copies of the tier-discount branch drift independently → collapse into `discountFor(tier)` and call it at each site
- `readability` · magic-literal · medium · L22 — `0.1` carries the gold-tier rate with nothing naming it → name `GOLD_DISCOUNT_RATE`
- `comments` · R1 · REMOVE · L17 — "// multiply by the rate" restates the line beneath it → delete these lines

### src/checkout/receipt.ts
- `naming` · role-name · nit · L9 — `receiptArray` names the type instead of the role → `receipts`
- `comments` · R2 · ADD · L44 — the 250 ms retry gap is a gateway constraint no reader can infer → "// 250 ms — the gateway rejects retries closer than its own debounce window"

### docs/checkout-spec.md
- `spec` · missing-requirement · high · L14 — "A receipt lists the discount applied per line item" has no implementation in the diff → add the per-line discount to `Receipt`

**Not flagged:** `JSON.parse(raw) as Config` at L7 (boundary narrowing, not `needless-cast`); the exhaustive `default:` throw at L61 (defensive assertion, not `dead-code`).

**Tally:** 5 quality findings (3 high · 1 medium · 1 nit) · 8 comments (1 remove · 0 rewrite · 0 move · 1 add · 6 keep) · 3 files. Lenses: 11 of 11. Spec: 4 of 5 requirements met. Skipped: pnpm-lock.yaml (lockfile).
```

A report may also carry a `Boy-scout` block, with optional fixes in code the change did not touch,
and a `Reconciliation` line above it that counts how the reviewers' notes to each other were
resolved. A clean change gets a one-line verdict and the tally.

Right after the report, one menu asks what to apply:

- Safe fixes: mechanical edits such as blank lines, named constants, renames, guard clauses, and
  comment removals and rewrites.
- Walk the structural ones: one at a time, each with its own yes. Extractions, moves, splits, and
  every correctness, security, coherence, assumptions and performance fix that is not
  report-only.
- Boy-scout extras: fixes outside the change.
- Report only: change nothing.

The menu offers only the options that have findings, plus Report only. Security fixes are never in the safe batch.
Spec findings describe work to do, so they are report-only, with one exception: a verified
`wrong-implementation` that one edit fixes can be offered as a fix. After the edits, the project's build
and tests run once, and the wrap-up lists any approved fix that was skipped or could not be applied
as approved. When a fix removes a secret from the source, rotating that secret is still your job.

The same menu asks how to commit what lands: one commit per finding family, made as each family
lands (each security fix in a commit of its own); fixup commits onto the branch commits that
introduced the edited lines, when the branch has commits of its own; one commit for everything; or
nothing. With `--pr` it then offers to push the commits to the pull request's branch, when that
branch is writable from here.

Before applying anything, the review saves the report and your selection to the session's scratch
directory, so a long apply walk survives a context compaction.

## Single-lens reviews

Two skills run a lighter review with a single reviewer and no parallel fan-out:

```
/code-review:comment-review     # comments only
/code-review:quality-review     # code craft only: no comments, correctness, security, coherence, assumptions, performance or spec
```

Claude can also start them on its own when you ask for a comment review or a quality review in
plain words. Both take the same paths and `--base` option as `/code-review:start-cr` and use the
same rule files.

## Customize with your project's rules

The review reads your conventions before it judges anything. Two kinds of files matter.

Files that create findings: `CODING_STANDARDS.md` at the repository root (committed) and
`CODING_STANDARDS.local.md` beside it (personal; add it to `.gitignore`). Both apply; where they
disagree, the `.local` file wins for that statement. Only the pair at the root counts. An explicit
rule such as "Domain services MUST NOT import from `infra/`" becomes a `standards` finding that
quotes it. Severity follows the rule's keyword:

| Keyword | Severity |
|---|---|
| MUST, MUST NOT, NEVER, ALWAYS | high |
| SHOULD, or no keyword | medium |
| MAY, prefer, consider | nit |

Vague prose such as "write clean code" creates nothing. Rules about formatting, whitespace, import
order and quotes are skipped when a formatter or linter config sits at the repository root
(`.prettierrc*`, `biome.json`, `eslint.config.*`, `.eslintrc*`, `.editorconfig`, `ruff.toml` or a
`[tool.ruff]` table in `pyproject.toml`, `.golangci.yml`, `rustfmt.toml`, `phpcs.xml`,
`.php-cs-fixer*`), because the tool enforces them.

Decision records create findings too: the coherence lens flags code that breaks a rule stated by
an accepted ADR, `CONTEXT.md`, or a decision document in the change, and quotes the rule. Other
design notes and plans only raise it as a candidate the merge decides.

Files that only silence findings: `CLAUDE.md` and `AGENTS.md` (at the root and in every directory
down to the reviewed file), `CONTRIBUTING.md`, `.cursor/rules`, and `.claude/rules/*.md`. When one
of them documents a style, the review stops flagging it. When two project files disagree, the more
specific one wins, and the report names the conflict on its `Conventions` line.

## What it reviews and what it skips

Reviewed: source files with the extensions `.ts .tsx .mts .cts .js .jsx .mjs .cjs .py .go .rs .java
.kt .swift .c .cpp .h .rb .php .vue .scala .cs .sh`, plus Terraform, Dockerfiles, Helm charts,
compose files and other infrastructure-as-code. Tests get every lens except performance;
infrastructure code also skips objects & patterns. Access policies (`*.rego`,
`*.cedar`, Cerbos and Kubernetes RBAC manifests, IAM policy files), `CODEOWNERS` and CI workflow
files are reviewed by the security, assumptions and coherence lenses only.

Skipped, and listed on the report's `Skipped` line: JSON, lockfiles, generated or minified files,
Markdown and other docs, `.txt`, other static config (`.yaml`, `.toml`, `.ini`, `.env`), and
license headers. Two lenses read them anyway. Coherence judges every skipped file except
lockfiles, generated output and real `.env` files, because a README, a migration or a compose file
is one side of the disagreements it looks for; a real `.env` it only Greps for key names, never
reading a value. The spec lens, with a spec given, maps the spec against every changed
file, skipped and policy files included, because a workflow or a manifest is often what a spec
line describes; a real `.env` it too only Greps for key names.

Limits:

- It is not a security audit. The security lens reads source, policy and CI workflow files for
  the problems listed above. It does not scan dependencies, `.env` files, lockfiles or action
  pinning; run Claude Code's `/security-review` for those.
- The correctness, coherence and assumptions lenses read; they never run the code. A claim that
  needs a run to settle comes back marked `(verify)`.
- The assumptions lens reads the installed dependencies. In a checkout with none it uses the main
  worktree's install when the lockfile pins the same version, and otherwise marks the claim
  `(verify)`.
- The rules are written for imperative and object-oriented code, mostly JavaScript and TypeScript.
  A rule with no counterpart in a language is cleared, not forced: wasted-render applies only to
  `.tsx` and `.jsx`, blocking-in-async only to Node and Python asyncio, and infrastructure code
  skips the module, object, pattern, test and cast rules.

## Internal parts

Three skills split `/code-review:start-cr` into steps for automated workflows, which cannot answer
questions or start sub-agents of their own. They are internal: hidden from the `/` menu, called by
the `fd3` plugin's implementation workflows, and not meant for you to run. `/code-review:start-cr`
uses `cr-scan` too: it writes the same context directory itself and runs each lens as the
`code-review:scanner` agent, which has only the tools a lens needs and loads no `CLAUDE.md`.

| Skill | Arguments | Writes |
|---|---|---|
| `code-review:cr-prepare` | `--base <ref> --out <dir> [-C <checkout>] [--spec <path> [--spec-focus <codes>]]` | `scope.json`, `conventions.md`, `standards.md` |
| `code-review:cr-scan` | `--lens <lens>[,<lens>…] --context <dir>`: one agent per active lens, or one agent judging a comma-separated list in turn | `<lens>.md` per lens |
| `code-review:cr-merge` | `--context <dir>` | `cr-report.md`, and returns each finding with its fix risk: `safe`, `structural` or `report-only`, plus the real problems no rule names and the files left to `/security-review` |

`--spec-focus "DB-1,D3"` names, by element code or decision id, the part of the spec a change
implements; it needs `--spec`. The spec and correctness lenses then judge the change against those
elements first and read the rest of the spec only where those elements point or the diff reaches,
and the spec lens counts only the focused requirements and calls any other behaviour unasked.

A cr-scan list trades isolation for cost. Every cr-scan agent pays the same start-up reading
before it judges a line, which is most of the cost on a change of a few files; one agent judging
a list pays it once, but its later lenses read the change with the earlier lenses' work in context,
and the lenses run in turn rather than in parallel. The caller decides: a list for a small change,
one agent per lens for a large one. Each lens in a list still writes its own `<lens>.md` and gets
its own closing block, in the listed order, so `cr-merge` works the same either way.

They review committed changes only, never edit the checkout, and never ask anything. An empty
change or a lens that did not report comes back as a status (`empty`, `incomplete`), never as a
clean review.

## Upgrading from comment-review or quality-review

This plugin replaces the separate `comment-review` and `quality-review` plugins, which the
marketplace no longer lists. Uninstall them, or you will see two copies of each skill.

## Development

- `evals/`: a promptfoo eval suite, used for development. See `evals/README.md`.
- `CONTEXT.md`: the plugin's glossary.
- `docs/adr/`: the design decisions behind the lens split, the active lens set, and the coherence
  and assumptions lenses.

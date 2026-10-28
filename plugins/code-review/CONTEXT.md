# code-review

Merged review plugin: one orchestrator fans out parallel scanners over a change,
each scanner judging a fixed rule subset; findings are merged into one report.
Successor of the `comment-review` and `quality-review` plugins.

## Language

**Orchestrator (`start-cr`)**:
The plugin's command (`commands/start-cr.md`) — explicitly invoked, never auto-triggered — that resolves scope once, resolves the Active lens set, dispatches its Scanners in parallel, and merges their findings into a single report.
_Avoid_: runner, coordinator, code-review (that is the plugin, not the command)

**Scanner**:
One parallel review subagent running exactly one Lens — the `code-review:scanner` agent running the `cr-scan` skill over a context directory.
_Avoid_: role, reviewer, worker

**Lens**:
One of the eleven rule clusters: comments (`R1`–`R12`), readability & tests, naming & module, objects & patterns, simplicity & types, correctness, security, coherence, assumptions, performance, spec. Six sit beyond the craft five: correctness, security, coherence and assumptions (always on), and two gated ones — performance (executable source files in scope), spec (a spec file named — `--spec <path>`, or the one the diff carries, accepted by the user). Comments is a Lens like any other, not a special case; the six added Lenses have no standalone skill.
_Avoid_: theme, dimension

**Rules file**:
The single source of truth for one Lens's rule text: `references/rules/<lens>.md`, named after the lens with no numeric prefix (`comments.md`, `readability-tests.md`, `naming-module.md`, `objects-patterns.md`, `simplicity-types.md`, `correctness.md`, `security.md`, `coherence.md`, `assumptions.md`, `performance.md`, `spec.md`).

**Family**:
One of the fourteen stable top-level labels in the quality vocabulary: `readability`, `tests`, `naming`, `module`, `objects`, `patterns`, `simplicity`, `correctness`, `security`, `coherence`, `assumptions`, `performance`, `spec`, and `standards`. Thirteen are fixed by the plugin; `standards` is repo-defined (its rules come from the Standards file).

**Rule**:
A specific sub-tag under a Family — one of the 68 fixed rules across the thirteen plugin-defined Families, or a repo-defined `standards` rule whose slug derives from the quoted rule — or one of the comment rules `R1`–`R12`.

**Finding**:
The quality-side unit of output: `family` · rule · severity · lines → fix.

**Verdict**:
The comment-side unit of output: per-comment KEEP / REMOVE / REWRITE / MOVE / ADD. `ADD` is the only verdict with no existing comment to quote — an R2 *missing WHY* to write at non-obvious code.

**Candidate**:
A site a Scanner confirmed and owns, but whose rule fit or calibration it could not settle. It travels in the Scanner's `CANDIDATES` block and the Orchestrator decides it — promoting it to a graded Finding or clearing it into `Not flagged`. Distinct from `(verify)` (the *fact* is unconfirmable) and `HANDOFF` (another Lens's family owns it); the three are never used interchangeably.
_Avoid_: maybe-finding, soft finding, low-confidence finding

**Standards file**:
The root pair `CODING_STANDARDS.md` + `CODING_STANDARDS.local.md`, read together under LAYER semantics — both apply, `.local` wins per statement on conflict — and only at the repository root. Unlike every other convention file, a Standards file **generates** `standards` Findings from its explicit, quotable rules; vague prose in it generates nothing.
_Avoid_: style guide, conventions file (a conventions file — `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.claude/rules`, `.cursor/rules` — only suppresses)

**Active lens set**:
The N Lenses (up to 11) that Step 2b of **start-cr** resolves for one run: the five craft Lenses, correctness, security, coherence and assumptions always — objects & patterns except over a list of `iac` files alone, and each needs files of its own, so a change of policy files only runs security, assumptions and coherence, and a change whose every file is skipped (documents, changesets, config data) runs coherence alone, each plus spec when one is named — performance when the source-kind subset of the resolved files (minus `.sh` and `*.config.*`) is non-empty, spec when a spec file was named. The report's `Lenses: L of 11` line records it, naming every inactive Lens with its reason.
_Avoid_: lens selection (the user never picks), enabled lenses

## Relationships

- **start-cr** fans out to the **Active lens set** — up to 11 **Scanners**, one per active **Lens**
- Every **Lens** has exactly one **Rules file**; a craft Lens's file is read by both its standalone skill and **start-cr**, a gated Lens's file by **start-cr** only
- Conventions suppress, **Standards files** generate: a convention file turns a would-be **Finding** into a non-finding, a **Standards file** produces `standards` **Findings**
- Every **Scanner** reads the **Standards file** pair and raises `standards` **Findings** only inside its own Lens's subject
- The six added **Lenses** (correctness, security, coherence, assumptions, performance, spec) have no standalone skill
- **coherence** also reads the skipped files (documents, config data, migrations), never lockfiles or generated output; **assumptions** reads the installed dependency source and lockfile as evidence, never as files it judges
- An accepted ADR, `CONTEXT.md` or a decision document in the diff generates `coherence` · invariant-breach **Findings**; `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md` and `.claude/rules` stay suppress-only
- A **Scanner** returns **Findings**/**Verdicts** only; the **Orchestrator** merges, dedups, and re-grades severity centrally
- A **Scanner** detects; the **Orchestrator** filters. Uncertainty travels as a **Candidate** rather than being dropped at detection, so the filter decides it with the whole review in view
- The skills `comment-review` and `quality-review` stay independently invocable alongside **start-cr**
- The **start-cr** report groups by **file**, not by Scanner; **Findings** and **Verdicts** keep their own vocabularies side by side (no severity↔verdict mapping)

## Example dialogue

> **Dev:** "Can I run just the comment **Scanner**?"
> **Domain expert:** "Invoke the `comment-review` skill directly — **start-cr** always runs its whole **Active lens set**; a **Scanner** is its internal unit of fan-out, not a user-facing switch. The set is decided by the change and by whether a spec file is named, never by picking lenses."

## Flagged ambiguities

- "scanner" was earlier sketched as 3 thematic groups (words / structure / reuse) — resolved: a Scanner is lens-granular; the first release had 5 Lenses, matching quality-review's existing fan-out lenses plus comments, and the Active lens set now spans 11.
- comments was earlier sketched as a special case beside the 4 quality lenses — resolved: comments is an equal Lens with its own Rules file.
- architecture, structural, and code-smell reviews were proposed as three more Scanners — resolved: folded into existing Lenses (four `module` rules, three `objects` rules, flag bullets on `composed-method`, `intent-name`, `dead-code`) because their rules overlapped the existing families by roughly 80%.
- middle-man, needless-indirection, and pass-through were proposed as three rules — resolved: one rule, `module` · pass-through, absorbs all three.
- a `critical` severity was proposed for security — resolved: severity stays `high | medium | nit`; a `security` or `spec` Finding is never `nit`.
- a `types` Family (Primitive Obsession, explicit type boundaries) was proposed — resolved: not added; type concerns stay under `simplicity` · needless-cast and the language-applicability rules.
- cross-artifact drift and false beliefs about dependencies were proposed as two more Lenses, against the folding of architecture, structural and code-smell reviews — resolved: `coherence` and `assumptions` became Lenses because each needs evidence no other Lens reads (two artifacts quoted against each other; installed dependency source pinned by the lockfile). Their seams have one owner each: sides the type checker connects are `correctness` · contract-mismatch, others `coherence` · contract-drift; comment text in a source file is `comments` R9, any other prose `doc-drift`, the active spec `spec`'s alone; import arrows stay `module` · dependency-direction and `CODING_STANDARDS` rules `standards`; wider trust or a missing authorization check is `security`; a setup/teardown pair inside one function is `patterns` · execute-around, one missing across units `missing-counterpart`; missing handling for a declared outcome is `correctness`, a false belief about third-party, runtime or platform internals `assumptions`; a test name claiming an unchecked boundary is `tests` · test-fidelity, a weak boundary its tests miss `tests` · mutation-gap.
- the Code Auditor patterns (async `forEach`, fire-and-forget promises, unguarded `JSON.parse`, unchecked HTTP status, missing timeouts and the rest) were proposed as a Lens — resolved: Flag conditions on the existing `correctness` rules, each still needing its input and outcome.
- logic bugs were first left out of scope (the bundled `/code-review` hunts bugs) — resolved: Scanners kept handing them off under invented families with no row to grade them on, so a `correctness` Lens owns them, always on, never `nit`. A HANDOFF names one of the fixed Families, never a new one.
- `over-complex` once covered both duplication and a single long site — resolved: duplicated logic stays `over-complex` (high); duplication with no logic to drift (test cases, a one-line expression, a restated declaration) is `shallow-duplication` (medium); a single site longer than its idea is `verbose` (nit).
- `dead-code` and `full-construction` once graded every case `high` — resolved: an unused export or return field and a redundant fallback are `dead-code-surface` (medium), and a complete object exposing its layout is `exposed-representation` (medium); an unreachable branch, an unread binding and a half-initialised object stay `high`.

# code-review

Merged review plugin: one orchestrator fans out parallel scanners over a change,
each scanner judging a fixed rule subset; findings are merged into one report.
Successor of the `comment-review` and `quality-review` plugins.

## Language

**Orchestrator (`start-cr`)**:
The plugin's command (`commands/start-cr.md`) — explicitly invoked, never auto-triggered — that resolves scope once, resolves the Active lens set, dispatches its Scanners in parallel, and merges their findings into a single report.
_Avoid_: runner, coordinator, code-review (that is the plugin, not the command)

**Scanner**:
One parallel review subagent running exactly one Lens.
_Avoid_: role, reviewer, worker

**Lens**:
One of the eight rule clusters: comments (`R1`–`R12`), readability & tests, naming & module, objects & patterns, simplicity & types, security, performance, spec. Three sit beyond the craft five: security (always on), and two gated ones — performance (executable source files in scope), spec (`--spec <path>` given). Comments is a Lens like any other, not a special case; the three added Lenses have no standalone skill.
_Avoid_: theme, dimension

**Rules file**:
The single source of truth for one Lens's rule text: `references/rules/<lens>.md`, named after the lens with no numeric prefix (`comments.md`, `readability-tests.md`, `naming-module.md`, `objects-patterns.md`, `simplicity-types.md`, `security.md`, `performance.md`, `spec.md`).

**Family**:
One of the eleven stable top-level labels in the quality vocabulary: `readability`, `tests`, `naming`, `module`, `objects`, `patterns`, `simplicity`, `security`, `performance`, `spec`, and `standards`. Ten are fixed by the plugin; `standards` is repo-defined (its rules come from the Standards file).

**Rule**:
A specific sub-tag under a Family — one of the 42 fixed rules across the ten plugin-defined Families, or a repo-defined `standards` rule whose slug derives from the quoted rule — or one of the comment rules `R1`–`R12`.

**Finding**:
The quality-side unit of output: `family` · rule · severity · lines → fix.

**Verdict**:
The comment-side unit of output: per-comment KEEP / REMOVE / REWRITE / MOVE / ADD. `ADD` is the only verdict with no existing comment to quote — an R2 *missing WHY* to write at non-obvious code.

**Candidate**:
A site a Scanner confirmed and owns, but whose rule fit or calibration it could not settle. It travels in the Scanner's `CANDIDATES` block and the Orchestrator decides it — promoting it to a graded Finding or clearing it into `Not flagged`. Distinct from `(verify)` (the *fact* is unconfirmable) and `HANDOFF` (another Lens's family owns it); the three are never used interchangeably.
_Avoid_: maybe-finding, soft finding, low-confidence finding

**Standards file**:
The root pair `CODING_STANDARDS.md` + `CODING_STANDARDS.local.md`, read together under LAYER semantics — both apply, `.local` wins per statement on conflict — and only at the repository root. Unlike every other convention file, a Standards file **generates** `standards` Findings from its explicit, quotable rules; vague prose in it generates nothing.
_Avoid_: style guide, conventions file (a conventions file — `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.claude/rules` — only suppresses)

**Active lens set**:
The N Lenses (6 to 8) that Step 2b of **start-cr** resolves for one run: the five craft Lenses and security always, performance when the source-kind subset of the resolved files is non-empty, spec when `--spec` was given. The report's `Lenses: L of 8` line records it, naming every inactive Lens with its reason.
_Avoid_: lens selection (the user never picks), enabled lenses

## Relationships

- **start-cr** fans out to the **Active lens set** — 6 to 8 **Scanners**, one per active **Lens**
- Every **Lens** has exactly one **Rules file**; a craft Lens's file is read by both its standalone skill and **start-cr**, a gated Lens's file by **start-cr** only
- Conventions suppress, **Standards files** generate: a convention file turns a would-be **Finding** into a non-finding, a **Standards file** produces `standards` **Findings**
- Every **Scanner** reads the **Standards file** pair and raises `standards` **Findings** only inside its own Lens's subject
- The three added **Lenses** (security, performance, spec) have no standalone skill
- A **Scanner** returns **Findings**/**Verdicts** only; the **Orchestrator** merges, dedups, and re-grades severity centrally
- A **Scanner** detects; the **Orchestrator** filters. Uncertainty travels as a **Candidate** rather than being dropped at detection, so the filter decides it with the whole review in view
- The skills `comment-review` and `quality-review` stay independently invocable alongside **start-cr**
- The **start-cr** report groups by **file**, not by Scanner; **Findings** and **Verdicts** keep their own vocabularies side by side (no severity↔verdict mapping)

## Example dialogue

> **Dev:** "Can I run just the comment **Scanner**?"
> **Domain expert:** "Invoke the `comment-review` skill directly — **start-cr** always runs its whole **Active lens set**; a **Scanner** is its internal unit of fan-out, not a user-facing switch. The set is decided by the change and the `--spec` flag, never by picking lenses."

## Flagged ambiguities

- "scanner" was earlier sketched as 3 thematic groups (words / structure / reuse) — resolved: a Scanner is lens-granular; the first release had 5 Lenses, matching quality-review's existing fan-out lenses plus comments, and the Active lens set now spans 8.
- comments was earlier sketched as a special case beside the 4 quality lenses — resolved: comments is an equal Lens with its own Rules file.
- architecture, structural, and code-smell reviews were proposed as three more Scanners — resolved: folded into existing Lenses (four `module` rules, three `objects` rules, flag bullets on `composed-method`, `intent-name`, `dead-code`) because their rules overlapped the existing families by roughly 80%.
- middle-man, needless-indirection, and pass-through were proposed as three rules — resolved: one rule, `module` · pass-through, absorbs all three.
- a `critical` severity was proposed for security — resolved: severity stays `high | medium | nit`; a `security` or `spec` Finding is never `nit`.
- a `types` Family (Primitive Obsession, explicit type boundaries) was proposed — resolved: not added; type concerns stay under `simplicity` · needless-cast and the language-applicability rules.

# code-review

Merged review plugin: one orchestrator fans out parallel scanners over a change,
each scanner judging a fixed rule subset; findings are merged into one report.
Successor of the `comment-review` and `quality-review` plugins.

## Language

**Orchestrator (`start-cr`)**:
The plugin's command (`commands/start-cr.md`) — explicitly invoked, never auto-triggered — that resolves scope once, dispatches all Scanners in parallel, and merges their findings into a single report.
_Avoid_: runner, coordinator, code-review (that is the plugin, not the command)

**Scanner**:
One parallel review subagent running exactly one Lens.
_Avoid_: role, reviewer, worker

**Lens**:
One of the five equal rule clusters: comments (`R1`–`R12`), readability & tests, naming & module, objects & patterns, simplicity & types. Comments is a Lens like any other, not a special case.
_Avoid_: theme, dimension

**Rules file**:
The single source of truth for one Lens's rule text: `references/rules/<lens>.md`, named after the lens with no numeric prefix (`comments.md`, `readability-tests.md`, `naming-module.md`, `objects-patterns.md`, `simplicity-types.md`).

**Family**:
One of the seven stable top-level labels in the quality vocabulary (`readability`, `tests`, `naming`, `module`, `objects`, `patterns`, `simplicity`).

**Rule**:
A specific sub-tag under a Family (22 total), or one of the comment rules `R1`–`R12`.

**Finding**:
The quality-side unit of output: `family` · rule · severity · lines → fix.

**Verdict**:
The comment-side unit of output: per-comment KEEP / REMOVE / REWRITE / MOVE.

## Relationships

- **start-cr** fans out to exactly **5 Scanners**, one per **Lens**
- Every **Lens** has exactly one **Rules file**; both the standalone skills and **start-cr** read the same file
- A **Scanner** returns **Findings**/**Verdicts** only; the **Orchestrator** merges, dedups, and re-grades severity centrally
- The skills `comment-review` and `quality-review` stay independently invocable alongside **start-cr**
- The **start-cr** report groups by **file**, not by Scanner; **Findings** and **Verdicts** keep their own vocabularies side by side (no severity↔verdict mapping)

## Example dialogue

> **Dev:** "Can I run just the comment **Scanner**?"
> **Domain expert:** "Invoke the `comment-review` skill directly — **start-cr** always runs all five **Scanners**; a **Scanner** is its internal unit of fan-out, not a user-facing switch."

## Flagged ambiguities

- "scanner" was earlier sketched as 3 thematic groups (words / structure / reuse) — resolved: a Scanner is lens-granular; there are 5 Lenses, matching quality-review's existing fan-out lenses plus comments.
- comments was earlier sketched as a special case beside the 4 quality lenses — resolved: comments is an equal Lens with its own Rules file.

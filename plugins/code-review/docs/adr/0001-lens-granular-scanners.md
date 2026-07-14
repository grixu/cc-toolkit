# start-cr fans out to five lens-granular scanners reading per-lens rules files

Status: accepted

The `code-review` plugin merges `comment-review` and `quality-review` under one
orchestrator command, `start-cr`, which always dispatches exactly five parallel
scanners — one per lens: comments (`R1`–`R12`), readability & tests,
naming & module, objects & patterns, simplicity & types. Comments is an equal
lens, not a special case. Each lens's full rule text lives in exactly one
plugin-level file (`references/rules/<lens>.md`, no numeric prefixes), read both
by the standalone skills and by `start-cr` — so a rule is fixed in one place.
The orchestrator is a command (never auto-triggered; five subagents must not
start by accident), takes only scope arguments (paths, `--base`) with no lens
selection (partial review = invoke a standalone skill), and renders one report
grouped per file with the two vocabularies side by side (quality
`family` · rule · severity, comments `R#` · KEEP/REMOVE/REWRITE/MOVE — no lossy
mapping between them), ending in a single risk-cut apply menu.

## Considered Options

- **3 thematic scanners** (words / structure / reuse) — rejected: requires
  cutting across the existing family vocabulary (e.g. `command-query` sits in
  `naming` but is a behavior rule) and re-splitting rule text per theme.
- **2 scanners = the two skills run whole** — rejected: does not deliver
  specialized parallel scanning; quality-review would just re-fan-out
  internally on large diffs.
- **Rules kept inline in quality-review's SKILL.md** — rejected: the
  orchestrator would re-parse sections out of a ~530-line file on every run;
  extraction to per-lens files removes the machinery that had already been
  duplicated once (`get_changes.py` existed byte-identical in both plugins).

## Consequences

- A lens regrouping (e.g. back to thematic scanners) means cutting rules
  files apart — the file boundary is the lens boundary.
- The severity table rows travel with their lens file; the master index
  table stays in quality-review's SKILL.md and must be kept in sync.

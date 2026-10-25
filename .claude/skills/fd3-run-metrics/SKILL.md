---
name: fd3-run-metrics
description: Measure where real fd3 implement-run/repair-run workflows spend tokens and how their CI fix loops and review lenses behave, from the local Claude Code transcripts, and compare a window of runs against a baseline. Use after real fd3 runs and before changing fd3 or code-review cost, model choice, lens activation or fix-loop rules.
---

Every number here comes from real runs on this machine. Evals measure a proxy; this measures the
runs themselves. Use it to decide what to tune and to check whether a release changed what it
was meant to change.

## 1. Collect a snapshot

```bash
node .claude/skills/fd3-run-metrics/scripts/collect.mjs --since 2026-10-25 [--until <ISO>] [--out <dir>]
```

The script reads every `implement-run` and `repair-run` workflow under `~/.claude/projects` and
`~/.ccs/**/projects`, and counts symlinked stores once. For each agent it reads the agent's own
transcript, so cost is the real per-turn usage priced at list price. The `tokens` field of the
workflow file is the last turn's context, not spend. The snapshot goes to
`~/.claude/fd3-run-metrics/<since>_<until>/` by default. Keep it out of this public repository:
rows carry client project names, branches and finding text.

The baseline is `~/.claude/fd3-run-metrics/baseline-2026-10-19/`: 64 runs on fd3 0.1.0–0.3.0,
taken before the 10-23..10-25 changes. `legacy-66/` beside it holds the raw rows of the original
66-run profile, two of whose runs are no longer on disk.

## 2. Report, or compare against the baseline

```bash
node .claude/skills/fd3-run-metrics/scripts/report.mjs <snapshot> [~/.claude/fd3-run-metrics/baseline-2026-10-19]
```

With a baseline, each cell reads `baseline → snapshot`. Spend is shown as a share and per run,
never as raw totals, because two windows never carry the same workload.

| Section | Read it for |
|---|---|
| Spend by category | where the money goes: implement, scans (`cr-scan`), the CI and fix loop |
| Spend by model family | whether a model pin took effect |
| Scan spend by pass / by diff size | the cost of review vs repair vs delta passes; diffs of ≤3 files go to the single scanner (lens `all`) |
| Lens yield | merged findings per lens against its scan spend. A finding's family maps to its lens. A count is not a value: one security finding can outweigh a hundred comment nits |
| Fix loops per validated branch | passed with 0 rounds, passed after rounds, exhausted, no verdict |
| Fix rounds | fixer rounds that committed or committed nothing. The baseline's fd3 versions returned no commit range from fixers, so it reads `commit unknown` |
| CI verdicts by model | unusable runner verdicts (incomplete, dirty, protocol breach, no output); each one forces a relaunch |
| Human-in-the-loop items per run | what the run handed back to a human, by kind |

## 3. Read why a loop stalled

```bash
node .claude/skills/fd3-run-metrics/scripts/rounds.mjs <snapshot> [<runId>]
```

This prints, for each branch that had a CI fix round, every CI verdict's failures and every
fixer's summary and caveats, in order. Read it before proposing a change to the fix loop. In the
baseline, all 8 exhausted loops were fixers declining the same failure each round, not weak fixes.

## Caveats

- List price is not Max-plan usage. Use shares and per-run deltas, not dollars, to argue a change.
- Transcripts expire after `cleanupPeriodDays` (30 by default). Collect soon after the runs you
  want to keep.
- Before fd3 0.5.0, a CI runner could read a stale `.exit` file in `$TMPDIR` as a pass. The
  baseline's "passed, 0 rounds" count is an upper bound.
- A handful of runs is noise. Treat a delta as real only when it holds across several runs, or
  is large next to the run-to-run spread.

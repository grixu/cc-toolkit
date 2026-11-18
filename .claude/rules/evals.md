---
paths:
  - "plugins/*/evals/**"
  - "scripts/run-evals.sh"
---
# Plugin evals

- Run a suite through `scripts/run-evals.sh <plugin> [pattern] [--trials k]`, never promptfoo directly: it resets the sandboxes, applies `scripts/evals-isolation.json` and archives the run. Usage is in the script's header.
- Keep re-runnable experiment scripts in `plugins/<plugin>/evals/<suite>/local/<experiment>/`, not in the scratchpad (it does not survive a reboot or the session). `local/` is git-ignored, so private case names stay off the public repo. Before each launch, append the exact command and its output path to that folder's `RUNS.md`, so the run can be found again after a compaction.
- Private material (fixtures copied from other repositories, traces, labelled data) goes to R2 through the suite's `data.mjs` (e.g. `plugins/dev-kit/evals/pr-risk/data.mjs`), never into git or a public CI artifact.

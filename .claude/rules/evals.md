---
paths:
  - "plugins/*/evals/**"
  - "scripts/run-evals.sh"
---
# Plugin evals

- Run a suite through `scripts/run-evals.sh <plugin> [pattern] [--trials k]`, never promptfoo directly: it resets the sandboxes, applies `scripts/evals-isolation.json` and archives the run. Usage is in the script's header.
- Keep re-runnable experiment scripts in `plugins/<plugin>/evals/<suite>/local/<experiment>/` (`plugins/<plugin>/evals/local/<experiment>/` for a suite that lives directly in `evals/`), not in the scratchpad (it does not survive a reboot or the session). `local/` is git-ignored, so private case names stay off the public repo. Before each launch, append the exact command and its output path to that folder's `RUNS.md`, so the run can be found again after a compaction.
- Private material (fixtures copied from other repositories, traces, labelled data) goes to R2 through `pnpm eval:data push|pull|list <plugin>[/<suite>]`, never into git or a public CI artifact. The suite commits an `eval-data.json` (`prefix`, `root`, `paths`, the pinned `sha256`) and git-ignores the data itself, usually under `local/`. Every R2 script reads the keys from the environment only. Locally they come from the git-ignored `.r2-secrets.sh`, which `bash scripts/with-r2-keys.sh <command>` exports before running the command (`pnpm eval:data` goes through it): never read, source or print the file yourself. When it is missing, create it with `bash scripts/r2-secrets-init.sh`, which writes it from 1Password without printing a value. List the data folders in `paths`, never `.`, so the experiment folders beside them stay out of the tarball and a pull never moves them. dev-kit's pr-risk and story-gate keep their own `data.mjs`: pr-risk builds sets from picked files, and story-gate packs two folders and leaves out the bare clones.

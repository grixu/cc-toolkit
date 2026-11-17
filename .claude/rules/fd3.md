---
paths:
  - "plugins/fd3/**"
---
# fd3 — plugin conventions

- Check the workflow scripts in `workflows/` with `node --test 'plugins/fd3/tests/workflows/*.test.mjs'` (CI runs the same). `node --check` rejects them: their top-level `return` is legal only inside the Workflow runtime.
- The workflow scripts are large (`implement-run.js` is ~1,900 lines). List one with `get_file_outline`, then Read by `offset`/`limit`; do not read it whole.
- Eval-suite rules are in `.claude/rules/fd3-evals.md`, which loads for `plugins/fd3/evals/**`.

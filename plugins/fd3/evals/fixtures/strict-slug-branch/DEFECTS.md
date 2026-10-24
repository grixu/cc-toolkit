# strict-slug-branch — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it, and `SETUP.sh`, from the
sandbox copy.

Serves `implement-fix-cr-spec-bound` (mode M7: a review fixer silently changes behaviour the spec
states). The git root is `app/`. `SETUP.sh` creates `feat/product-groups` with its worktree at
`app.worktrees/feat-product-groups`, commits `branch/` onto it (the task's `src/config.ts`), removes
`branch/`, records the branch head in `.sandbox/.origins/implement-fix-cr-spec-bound/branch-head`,
and points the task file's `repository:` at the sandbox.

The planted conflict:

- `docs/spec.md` decision D3 states the slug pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$` and that `a--b`,
  `-a` and `a-` are rejected at startup.
- `src/config.ts` line 3 (branch only) is that pattern, `PRODUCT_GROUP_SLUG`.
- `src/contract.ts` (on `main`) holds the API contract's looser `PRODUCT_GROUP_PATTERN`,
  `/^[a-z0-9-]+$/`, which accepts all three.

The review finding the harness scripts into cr-merge (`lib/implement-scenarios.mjs`):
`src/config.ts:L3`, patterns · duplicate-literal, medium, safe — "replace the local
PRODUCT_GROUP_SLUG regex with the contract's PRODUCT_GROUP_PATTERN". cr-merge did not mark it
`specBound`, which is what routes it to the fixer: the fixer is the last line of defence, as in the
trace this fixture is modelled on.

The assertions: the finding comes back under `skipped` (matched by its location), a caveat names
`D3` or the spec as the reason, and from the
branch head no tracked line changed and no untracked file appeared in the worktree; the main
checkout stays clean.

# deploy-path-payments-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
Used by validate-deploy-path. Shape taken (anonymised) from a real validation pass that went
`not ready` because the rollout assumed `main` deploys to `test`.

## Derivation

Derived from `phased-payments-spec`: identical `src/`, `README.md` and `package.json`, plus
`.github/workflows/payments-cd.yaml`. The spec is `phased-payments-spec`'s with seven
replacements, each of one unique passage:

- section 4 prerequisites: the repository's one CI configuration is the deploy workflow;
- section 5: the deploy workflow deploys on merge to `main`;
- section 7: phase 1's `Where` cell reads `test`, then `stage`, then `prod`, and the paragraph
  under the table says a merge to `main` deploys to `test`, then the same commit is promoted to
  `stage` and `prod`;
- section 8: phase 1 is verified on `test`;
- section 12: `git ls-files` returns 8 files, and a new row claims the `main` → `test` path, citing
  the workflow file without a line.

Regenerate from the base rather than editing the spec by hand, so the two never drift apart.

## The planted defect: the deploy path

`.github/workflows/payments-cd.yaml` contradicts section 7:

- lines 4-7 — the workflow runs on pushes to `main` and `release/test`;
- lines 10-13 — `deploy-test` runs only when `github.ref == 'refs/heads/release/test'`;
- lines 18-21 — `deploy-stage` runs on `main`;
- lines 26-30 — `deploy-prod` needs `deploy-stage` and runs on `main`.

A merge to `main` never reaches `test`: it goes to `stage` and then straight to `prod`. Phase 1 as
written cannot be verified on `test` before it reaches production.

The check requires: the verdict is `not ready` or phase 1's row is not `yes`; a finding cites
`payments-cd.yaml` at a line inside 3-19 (the triggers, the test job and the stage job's `main`
condition), or names the file on a line quoting `release/test` or `refs/heads/main`, strings only
the workflow holds; and the run changes nothing but the spec and new files under `spec/` (evidence).

Everything else is `phased-payments-spec`'s contract (its DEFECTS.md), including the deferred
platform-team ceiling that bounds phase 2.

## Run
spec: spec/phased-spec.md
pass: 1
repositories:
- payments-service — main @ d4eb597 — not fetched: no remote is configured, so the checkout could not be compared with any upstream

## Verdict
not ready — the deploy path in section 7 is wrong: merging to `main` deploys to `stage` and then `prod`, and `test` is never part of that path. Nothing in the workflow applies DB-1's migration either.

| Phase | Ready | What holds it |
|---|---|---|
| 1 | no | Fixing the deploy path is the user's call; who or what applies the DB-1 migration is a fact only the user holds |
| 2 | no | It builds on phase 1. The platform team's confirmation of the egress ceiling (deferred) also limits it |

## Checks

| # | Check | Result |
|---|---|---|
| 1 | decisions do not contradict | pass (unchanged) |
| 2 | scope covers every decision | pass (unchanged) |
| 3 | every element described and coded | pass (unchanged) |
| 4 | dependencies exist, planned or deferred | pass (unchanged) |
| 5 | external contracts confirmed | pass (unchanged) |
| 6 | referenced documents open | pass (unchanged) |
| 7 | element contracts complete | fail — section 4, DB-1 does not say how its migration is applied in each environment |
| 8 | build order stated and holds | non-blocking — section 6, the items have no Phase / Lands as cells, and phase 2's config change has no item of its own |
| 9 | achievable in this project | fail — section 7, `.github/workflows/payments-cd.yaml` deploys `main` to stage→prod and only `release/test` to test, with no promotion step and no migration job |
| 10 | splittable into tasks | fail — section 7, a split cannot place the "verify on test, then promote" step for phase 1 |
| 11 | every element has a check | non-blocking — section 8, phase 2's check runs the test suite with its own value and never reads the deployed configuration phase 2 changes |
| 12 | no vague verb, no undecided either/or | non-blocking — section 4, no rule says what phase 2 sets if the confirmed ceiling is below 8, or whether the ceiling is per process or across all instances |

## Still open
- The phase 2 check does not measure the phase 2 change — section 8 — needs a check that reads `DELIVERY_RATE_LIMIT` in each environment's configuration, which lives outside this repository — non-blocking
- Work items have no phase or landing columns, and phase 2 has no work item — section 6 — can be derived from the phase 1 row ("all four work items… one branch, one pull request") — non-blocking
- No rule for a confirmed ceiling other than 8, and per-process versus all-instances is not stated — section 4 / D5 — the question: "if the platform team confirms a ceiling below 8, or one that covers all instances together, what does phase 2 set?" — non-blocking (it only matters if the confirmation comes back lower)

## Deferred
- Egress ceiling supports 8 attempts per second — section 4 — owner: platform team — placement: gate before phase 2
- Postgres reachable and a `DATABASE_URL` in the deploy manifest — section 4 — owner: payments team — placement: before the phase-1 deploy
- Somewhere to set `DELIVERY_RATE_LIMIT` — section 4 — owner: payments team — placement: before the phase-1 deploy

## Blocked
- **Deploy path (repair choice).** Sections 5, 7 and 8 and the original evidence row all say "a merge to `main` deploys to `test`, then is promoted to `stage` and `prod`". The workflow does something else:
  - `deploy-test` runs only when something is pushed to `release/test`.
  - A merge to `main` runs `deploy-stage`, then `deploy-prod` (`needs: deploy-stage`).
  - Nothing promotes a commit from one environment to the next.

  So the phase 1 gate "verified on `test`" can never sit in front of stage or prod. The question it would have asked: which fix?
  - (a) Push the phase 1 commit to `release/test`, verify there, then merge to `main`. This is my pick: phase 1 then lands in two steps.
  - (b) Use `stage` as the first environment that gets verified. That accepts a risk: prod deploys automatically right after stage, with no check in between.
  - (c) Add a promotion or approval gate to the workflow. That widens the scope.

  A second fact it needs: are there protection rules on the GitHub `prod` environment? These are repository settings, and the repository has no remote I could query. No further pass closes this.
- **DB-1 migration apply mechanism (fact only the user holds).** Section 5 says "CI applies the deploy — no human runs anything by hand", but no workflow job runs `node-pg-migrate` (the deploy steps are just `echo`). The question it would have asked: what applies the `idempotency_keys` migration in test, stage and prod, and is that step in scope here? No further pass closes this.

## Not validated
- Ticket tracker (PAY-231/244/251/262) — I had no tracker access, so section 11 is taken at the spec's word

## Spec edits applied
- section 3 (D4) — corrected the stale citation `src/billing/charge.ts:21` to `:22`. Line 21 is `saveIdempotencyKey`; `enqueueWebhook` is on line 22.

The only file written was `spec/phased-spec.md`. Besides the D4 fix, the header status now reads "not ready — validated 2026-10-25", and I appended the dated "Validation pass 1 — 2026-10-25" block (234 lines at this verdict). I checked all 12 original evidence rows and every `path:line` citation, because each one either gates phase 1 or is the reason for something being out of scope. Every citation except D4 resolved. I sent nothing to `main`, because nobody can answer questions during this run.
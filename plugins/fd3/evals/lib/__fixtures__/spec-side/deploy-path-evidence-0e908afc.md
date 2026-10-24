| The store functions are the only key readers/writers | `grep -rn "getIdempotencyKey\|saveIdempotencyKey" src/` — hits only in `src/store/idempotency.ts` and `src/billing/charge.ts` |
| The egress rate-limit ceiling supports 8 attempts per second | Unconfirmed — no documentation states the ceiling; treated as a declared gap, owner: platform team, placement: gate before phase 2 |

### Validation pass 1 — 2026-10-25

Verdict: not ready — claims: 13 verified / 3 deferred / 2 blocked — spec 234 lines at this verdict
Checked at: payments-service (no remote configured; `git fetch` not possible) @ d4eb597

Rows spot-checked: all 12 original rows (each gates phase 1 or justifies a scope cut, and the record is small), plus every `path:line` in the document.

| Claim | How it was verified |
|---|---|
| Every `path:line` citation resolves | Script over all citations at d4eb597: all resolve except `src/billing/charge.ts:21` in D4, which is `saveIdempotencyKey`; `enqueueWebhook` is line 22. Corrected in D4. |
| Original rows 1–7, 9–11 (in-memory store, lookup-before-charge, 5-attempt cap, no delay, no env read, no dependencies, worker unreferenced, enqueue exists, only two key callers) | Re-read at d4eb597: `git ls-files` = 8 files; `grep -rn "process.env\|queue/worker" src/` finds nothing; key-function hits only in `src/store/idempotency.ts` and `src/billing/charge.ts`. Verified. |
| `post` cannot fail (row 8) | `src/queue/worker.ts:14-16` returns `true`, module-private. Verified. |
| `npm test` runs `vitest run` | `package.json` `scripts.test`. Verified. |
| Row 12, the egress ceiling | Deferred as the spec declares it — owner: platform team, placement: gate before phase 2. |
| Postgres and `DATABASE_URL` reachable; a place to set `DELIVERY_RATE_LIMIT` | Deferred as declared in the section 4 prerequisites — owner: payments team, placement: before the phase-1 deploy. |
| **Refuted (row 9 of the original):** "a merge to `main` deploys to `test` first, then is promoted to `stage` and `prod`" | `.github/workflows/payments-cd.yaml`: `deploy-test` runs only on a push to `release/test`; a push to `main` runs `deploy-stage`, then `deploy-prod` (`needs: deploy-stage`) with no promotion step. Blocking, phase 1: section 7's environment order and section 8's "verified on `test`" gate cannot hold as written; blocked on a repair choice. |
| DB-1's migration is applied by CI in every environment (section 5: "CI applies the deploy — no human runs anything by hand") | No job in `.github/workflows/payments-cd.yaml` runs a migration, and the spec names no step that does; blocking, phase 1, blocked on a fact the payments team holds. |
| Tickets PAY-231, PAY-244, PAY-251, PAY-262 exist | No tracker access in this pass; taken at the spec's word. |

Findings (non-blocking): phase 2's check (section 8) runs the test suite with its own env value and never reads the deployed configuration that phase 2 changes. Section 6 items carry no Phase / Lands as cells, and phase 2's configuration change has no section 6 item. Neither section 4 nor section 7 states what phase 2 sets if the confirmed ceiling is below 8, or whether the ceiling applies per process or to all instances together.

Spec edits this pass: D4 citation `src/billing/charge.ts:21` → `:22`; header status.

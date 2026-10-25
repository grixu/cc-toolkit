# Question ledger

| # | Question | Round | Answer | Notes |
|---|---|---|---|---|
| 1 | Attempt cap now that it is known to be 5, not 3 | 1 | open | NOT void. Late fact added: AWS SDK standard=3, SRE Book=3/request, stripe-node=2 all cap lower than 5; recommendation to keep 5 stands on new reason (single caller, so SRE amplification/budget concerns do not apply). |
| 2 | Are backoff parameters hardcoded or per-call-site configurable | 1 | open | topic's own open question |
| 3.1 | Does `syncCatalog` start throwing on non-`ok` HTTP responses | 1 | open | without this, a 503 is never retried |
| 3.2 | Does `withRetry` gain a retryability predicate, or retry every error | 1 | open | |
| 4 | Per-attempt request timeout | 1 | open | |
| 5 | What bounds the retrying: per-attempt cap, overall deadline, both, or neither | 1, re-asked | open | ORIGINAL VOID: recommendation guessed the prior-art result; lookup contradicts it (sources ship both; gRPC A6 favours deadline, verified verbatim at source line 101). Re-asked with 4th option 'both'. |
| 6 | Does this change land with runnable tests (`npm test` is broken today) | 1 | open | |
| 7 | tsconfig / typecheck — nothing checks this TypeScript | 1 | VOID | recommendation was conditional on Q6; withdrawn from round 1, re-ask in round 2 under same number |
| 8 | Observability of retries | 1 | open | |

## Blocked, not yet numbered

- UNBLOCKED by `research/backoff-jitter-prior-art.md` — become numbered round-2 questions:
  - Base/multiplier/cap values. Multiplier=2 everywhere. Bases: AWS 50ms/1000ms cap 20s; stripe-node 0.5s cap 5s; Google cap 32-64s; Shopify 1s. SRE Book gives none.
  - Jitter strategy. No-jitter "clear loser"; equal jitter "the loser" among jittered; full vs decorrelated a toss-up. AWS=full, Google=additive<=1000ms, gRPC=+/-20%, Stripe=equal.
  - Retryable statuses: consensus 408/429/500/502/503/504. 425 per RFC 8470 s5.2, in no provider guide. 409 disputed (stripe-node only).
  - Retry-After: RFC 9110 s10.2.3, delay-seconds=1*DIGIT or HTTP-date (s5.6.7, MUST accept all three formats). GitHub/MS Graph/Slack/Shopify order it ahead of computed backoff; AWS clamps it; Shopify emits "2.0" violating the grammar.
  - CAVEAT: AWS post has NO simulation table (verified grep). Its comparison numbers are approximate chart reads, not published figures. Do not quote as measurements.
- How delays are asserted in tests (fake timers vs injected sleep) — UNBLOCKED, `research/vitest-fake-timers.md`
  returned: vitest 5.0.3 (verified via `npm view vitest version engines`; engines
  `^22.12.0 || ^24.0.0 || >=26.0.0`, local Node v26.10.0 satisfies). Async advance
  (`await vi.advanceTimersByTimeAsync`) is required; sync form does not drain microtasks.
  `setTimeout` faked by default. GAP: no reachable source argues for/against injecting `sleep`
  — becomes its own round-2 question rather than a recommendation premise.

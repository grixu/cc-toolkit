**1.1 — The unchecked HTTP response status.** `src/jobs/sync.ts:5` calls `await fetch(...)` and discards the result; Node's `fetch` resolves on `503`, so a supplier outage is currently recorded as a successful sync and never retried.
- **a) In scope — check the status and throw on a failure response.** This is what makes the retry path actually fire on the supplier failures the topic is about. The cost is that the change stops being confined to `src/retry.ts` and touches the caller, and a sync that silently "succeeded" during supplier outages will start failing loudly — which may surface downstream behaviour nobody has seen yet. **Recommended**: without it, every other decision in this session is tuning a retry loop that the supplier-overload case never enters.
- **b) Separate ticket, backoff ships first.** Keeps this change small, but ships a backoff schedule whose main justification — not hammering a struggling supplier — cannot be exercised by the only caller.
- **c) Leave as is.** No work. Supplier outages continue to be reported as successful syncs, indefinitely.

**1.2 — Error classification.** The catch at `src/retry.ts:8-9` retries every error class alike, so a programming `TypeError` and a DNS failure get the same 5 attempts.
- **a) In scope — retry only operational failures, rethrow the rest immediately.** Bugs and cancellations surface at once instead of after the full schedule. The cost is a judgment call about which errors count, and on this Node build that call is awkward in one specific place: a redirect-count-exceeded failure carries a plain `Error` with **no `.code`** to match on, because the typed error class lands only in undici 8.12.0 and Node 26.10.0 bundles 8.10.2 (I2).
- **b) Separate ticket.** Backoff ships first; until the ticket lands, adding backoff actively lengthens how long a programming bug takes to surface, from milliseconds to the whole schedule. **Recommended if 1.1 is deferred**, since doing 1.1 and 1.2 together is what makes the helper coherent, and doing neither at least keeps the change honest about being a stopgap.
- **c) Leave as is.** No work, and the backoff schedule becomes the latency floor for discovering any bug inside the retried operation.

My recommendation across 1.1 and 1.2 is **a) for both** — but note they are the same edit's two halves: 1.1 decides *when* retries happen, 1.2 decides *to what*.

**1.3 — Bounding a single hung attempt.** The topic wants a cap so "a sync job cannot hang for minutes". `fetch` is called with no timeout, so one attempt can hang indefinitely regardless of any delay budget.
- **a) In scope — bound each attempt, and abort the in-flight attempt when the overall budget runs out.** This is the only version in which "cannot hang for minutes" is a true statement. The cost is that aborting introduces a new failure mode to classify (an aborted attempt must not look like a bug to 1.2), and the per-attempt bound needs a number, which depends on A1. **Recommended**: F5 — a maximum total *delay* without this is a guarantee the code does not make.
- **b) Cap the summed delays only, as the topic proposes.** Cheap and local to `src/retry.ts`. Bounds the sleeping, not the job; a single stalled connection still hangs for as long as the supplier holds the socket.
- **c) Out of scope.** No work, and the stated "cannot hang for minutes" goal is dropped rather than met.

## 2. How does this change get validated?

Today nothing can be run: `package.json` declares no `dependencies` and no `devDependencies`, `"test": "vitest run"` has no vitest to run, there is no lockfile, no `node_modules`, no tsconfig.json and no test file (F7). Backoff is timing behaviour, which is exactly the kind that is wrong in ways reading cannot see.

- **a) Add `vitest` 5.0.5 as the only new devDependency, and commit a lockfile.** Vitest alone runs `.ts` tests — Vite transpiles TypeScript through esbuild, needing neither the `typescript` package nor a tsconfig.json, because type-checking is a separate opt-in that defaults to off (I20). Smallest change that makes the behaviour testable. The cost is one dependency tree and a lockfile this repo has never had, and no type-checking — a type error still only shows up in your editor. **Recommended**: it is the minimum that turns "the schedule looks right" into "the schedule is right", and it is one package.
- **b) Add `vitest`, `typescript` 7.0.2 and `@types/node`, plus a tsconfig.json.** Gives real type-checking too. Costs three dependencies and a config file, and a TypeScript 7 wrinkle to get right on the first try: since TypeScript 6.0, `types` defaults to `[]`, so `"types": ["node"]` has to be set explicitly or the `node:` built-ins have no types at all (I21).
- **c) No toolchain — verify by hand with a throwaway script.** Zero dependencies added. The delay schedule then has no regression test, so the next person to touch `MAX_ATTEMPTS` or the multiplier gets no warning from the repository.

## 3. What error should `withRetry` throw when the attempts run out?

`src/retry.ts:12` throws `lastError` and nothing else — the caller learns what went wrong on the final attempt, but not that there were five attempts, nor how long they took. With backoff added, "how long did it try" becomes a real question in an incident.

- **a) Throw an error naming the attempt count and total elapsed time, carrying the last failure as its underlying cause.** One error to read, and the original is still reachable for a stack trace. The cost is that any caller matching on the error's type or message would need updating — today there is exactly one caller and it matches on nothing (F3). **Recommended**: it is the smallest change that makes an exhausted retry distinguishable from a single failure in a log, which is the whole point of having a schedule.
- **b) Keep throwing the last error only.** No change, no caller impact. Logs stay ambiguous about whether the operation was tried once or five times over tens of seconds.
- **c) Collect every attempt's failure and throw them together as an aggregate.** Loses nothing — useful when attempts fail for *different* reasons, e.g. a DNS failure then a reset. The cost is a noisier error for the common case where all five failures are identical.

All three are available on every non-EOL Node line: `Error.cause` since Node 16.9 and `AggregateError` since Node 15 (I7).

## 4. Should a retry be observable from outside the helper?

Right now a retry is invisible: `src/retry.ts:8-9` swallows each failure and nothing is logged or counted, so four failed attempts leave no trace unless the fifth also fails. With backoff, the same silence also hides *waiting*. The repository has no logger and no dependencies to log with.

- **a) Accept an optional callback the caller supplies, invoked per retry with the attempt number, the delay about to be waited, and the error.** Keeps `withRetry` dependency-free and decides nothing about logging format on the caller's behalf. The cost is one more parameter in the signature, and a caller that passes nothing stays as silent as today. **Recommended**: it is the only option that adds observability without this zero-dependency helper picking a logging stack for the whole project.
- **b) `console.warn` on each retry.** No API change at all. Hardcodes a logging decision into a shared helper, and in a cron context those lines may go nowhere anyone reads.
- **c) Nothing — stay silent.** No work. The first question in any supplier incident, "did it retry and for how long", stays unanswerable from the logs.

---

**Answer as:** A1 (the three facts), 1.1, 1.2, 1.3, 2, 3, 4.

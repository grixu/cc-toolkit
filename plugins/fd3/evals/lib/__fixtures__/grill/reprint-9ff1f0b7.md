## What the landed lookup changed — round 1 stays open, this adds no questions

`research/vitest-timers-and-fetch-timeouts.md`. That agent had no MCP tools available, so its findings come from the installed package, pinned-tag sources and probes it ran on this machine — stronger evidence than docs, and it says so.

- **Finding 3 sharpens rather than changes.** Node 26 bundles undici 8.10.2, whose defaults are connect 10s, headers 300s, body 300s — so a hung attempt is not literally unbounded, but the per-attempt ceiling is 5 minutes, and with the real cap of 5 attempts the topic's "cannot hang for minutes" is already a ~25-minute worst case before any backoff is added. `bodyTimeout` measures the gap *between* body chunks, so a server dribbling a byte every 299s holds the response open indefinitely, and there is no default total-request deadline at all.
- **A cost I was about to be wrong about.** Vitest's fake timers do **not** mock `AbortSignal.timeout` — vitest issue #3088 still reproduces on 5.0.3, and the async timer variants do not fix it. The obvious implementation of a per-attempt timeout is therefore the one that cannot be unit-tested with fake clocks. That bears on the per-attempt-timeout question, not on anything asked below.
- **Both blocked questions it was dispatched for are now answerable** and go out in round 2 with numbers: the per-attempt request timeout, and how the delays get proven in a test (`vi.advanceTimersByTimeAsync` works; the synchronous variant silently drains one step and the test times out).

Nothing here voids a question or an answer. Round 1 is unanswered and reprinted in full:

**1. Who decides that an HTTP response is a failure worth retrying?** Today nobody does: `src/jobs/sync.ts:5` discards the response, and I probed that a 503 makes `fetch` resolve with `ok=false` rather than throw. Root of the tree.
- **a) The caller throws.** `syncCatalog` checks `response.ok` and throws; `withRetry` keeps seeing only exceptions and stays as generic as today. Cost: future callers must remember, with nothing enforcing it. **Recommended**: `withRetry<T>` (`src/retry.ts:3`) is generic and HTTP-unaware — status knowledge belongs in the caller, and there is exactly one caller.
- **b) The helper gains a retry predicate.** Cost: its signature changes before a second caller exists, and the predicate must handle both thrown errors and returned responses.
- **c) Neither — leave the gap.** Smallest diff. Cost: the new delay never runs for the supplier-overload case the topic opens with.

**2. What bounds the retry?** The topic's "keep the attempt cap as it is" was written believing the cap was 3; `src/retry.ts:1` says 5. Shape only — numbers are blocked on the backoff lookup.
- **a) Attempt count plus a total deadline**, whichever hits first. Cost: two knobs to document and test. **Recommended**: with backoff, attempt count stops predicting duration, and a sync job's real constraint is "be done by X".
- **b) Attempt count only.** One knob. Cost: duration is emergent — and with undici's 300s per-attempt ceiling, 5 attempts is a ~25-minute worst case nothing bounds.
- **c) Total deadline only.** Directly the thing we care about. Cost: against a fast-failing server the loop retries as many times as fit the budget — the hammering the topic opened with.

**3. How does this change get validated?** `package.json:6` promises `vitest run` with no `devDependencies`, no lockfile, no test file — `npm test` fails in a clean clone. Both parts land in the same file.

&nbsp;&nbsp;**3.1 The test runner.**
- **a) Add vitest 5.0.3 to `devDependencies`, commit the lockfile.** Cost: the repo's first dependency and lockfile to maintain. **Recommended**: an unpinned runner is exactly the component our *timing* assertions rest on; it should not move without a commit.
- **b) Unpinned, via `npx`.** Zero manifest churn. Cost: every machine gets whatever is current that day.
- **c) No test for the backoff.** Cost: the one behaviour review cannot eyeball goes unverified.

&nbsp;&nbsp;**3.2 Typechecking.** No `tsconfig.json`, no `typescript` dependency; the `.ts` files have never been compiled.
- **a) Add `typescript` + minimal `tsconfig.json` + `typecheck` script.** Cost: a second dev dependency and a config file. **Recommended**: cheap while the repo is 2 files, and the only thing that will check call sites against a backoff options object if one appears.
- **b) Stay untypechecked.** Vitest transpiles without checking, so tests still run. Cost: annotations are decoration; a wrong option name surfaces at runtime or never.
- **c) Defer to its own ticket.** Cost: needs an owner now.

**4. What does `withRetry` throw once attempts are exhausted?** `src/retry.ts:9` overwrites `lastError` each iteration and line 12 throws only the survivor; there is no logging. Only `syncCatalog` is affected and it does not catch, so no existing handling breaks either way.
- **a) A `RetryError` with attempt count and elapsed time, last failure as `cause`.** Cost: matching on the original error type means looking one level down. **Recommended**: once delays exist, "how long did we spend" is the first question an operator asks.
- **b) An `AggregateError` of every attempt's failure.** Nothing discarded. Cost: five near-identical errors, and loggers printing only `.message` show an empty one.
- **c) Keep throwing the last error.** Cost: the retrying stays invisible.

Answer as: 1, 2, 3.1, 3.2, 4.

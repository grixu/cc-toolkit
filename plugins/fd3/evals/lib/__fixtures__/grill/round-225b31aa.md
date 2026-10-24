**1. What should the attempt cap be, now that it is 5?** You asked to keep it as-is believing it was 3. With a multiplied delay between attempts, the cap sets the worst-case duration of a sync.
- **a) Keep 5.** No change to `src/retry.ts:1`; the proposal's wall-time estimates all need redoing against 4 waits instead of 2. **Recommended** — the cap is not what's broken, and changing two things at once makes a regression impossible to attribute.
- **b) Drop to 3**, the number you thought was there. Halves worst-case duration, but discards two attempts that currently exist and that may be the reason transient supplier blips go unnoticed today.
- **c) Derive it from a total deadline** instead of fixing a count — attempts continue until the budget is spent. Most adaptive, but it couples Q1 to Q5 and makes the failure message depend on timing rather than a constant.

**2. Hardcoded parameters or configurable per call site?** This is your own open question. There is exactly one caller today (F6).
- **a) An optional options object with defaults** — `withRetry(op, { baseDelayMs, ... })`, defaults applied when omitted, so `src/jobs/sync.ts` needs no edit. Cost: a public surface with no second consumer to validate it, and every default becomes a number someone must justify later. **Recommended** — the sleeping call is the one thing a second caller will certainly want to tune, and retrofitting an options bag later means touching every call site that exists by then.
- **b) Module-level constants only** — simplest, smallest diff, nothing to document. Cost: tests must either accept real multi-second sleeps or reach into module internals, which is the main practical argument against it.
- **c) Required explicit config, no defaults** — forces every caller to think. Cost: changes `src/jobs/sync.ts` immediately and makes the common case the verbose one.

**3. Retrying things that currently are not retried (F2).** These two cannot be settled separately: the predicate is pointless if nothing throws, and throwing without a predicate retries errors that will never succeed.
- **3.1 Does `syncCatalog` start throwing on a non-`ok` response?** Today `fetch` resolves on a 503 and the job reports success.
  - **a) Yes — check `response.ok` in `src/jobs/sync.ts` and throw.** Backoff then actually applies to the case the topic describes. Cost: scope grows beyond "add backoff", and syncs that silently "succeeded" against error pages will start failing loudly — which may look like a new bug on first deploy. **Recommended** — without it, this entire change is dead code for supplier outages.
  - **b) No — leave it, backoff covers network failures only.** Minimal diff. Cost: the stated motivation goes unaddressed and the silent-success bug stays, undocumented.
- **3.2 Does `withRetry` decide what is retryable?** Right now `src/retry.ts:8-10` catches every error identically, so a malformed-URL `TypeError` burns all 5 attempts with delays.
  - **a) Accept an optional `isRetryable(error)` predicate**, defaulting to "retry everything" so behaviour is unchanged when omitted. Cost: the caller now owns classification, and each call site can get it wrong differently. **Recommended** — it keeps HTTP knowledge out of a helper that is deliberately generic over `() => Promise<T>`.
  - **b) Classify inside `withRetry`** by inspecting the error. Cost: a generic retry helper gains HTTP-specific knowledge, and it can only guess, since `src/jobs/sync.ts` throws whatever shape it chooses.
  - **c) Retry everything, as today.** No new surface. Cost: permanent failures sleep through the full backoff ladder before surfacing.

**4. Should there be a per-attempt request timeout (F3)?** Nothing bounds a single `fetch` today.
- **a) Yes, in `withRetry` as a timeout that wraps each attempt.** Uniform for future callers. Cost: the helper must race a timer against an arbitrary promise it cannot cancel — it would abandon the operation rather than abort it, leaving the real request running.
- **b) Yes, in `src/jobs/sync.ts` via `AbortSignal.timeout(ms)` on the fetch.** The request is genuinely cancelled, and it turns a hang into a retryable error. Cost: every future caller re-implements its own. **Recommended** — only the caller knows how to cancel its own work, and this is the only option that actually aborts rather than abandons.
- **c) Out of scope.** Smallest change. Cost: the "cannot hang for minutes" goal in your proposal is not met, and Q5's cap becomes cosmetic.

**5. What shape should the total-delay bound take?** Your proposal says "possibly add a maximum total delay". The numbers are blocked by the prior-art lookup; the shape is not.
- **a) Cap each individual delay** (the delay grows, then plateaus). Simple, predictable, no bookkeeping. Cost: with a cap on each wait, total time still grows with the attempt count — it bounds the worst wait, not the worst sync. **Recommended** — it is the form the prior art lookup is checking against, and it composes with whatever Q1 settles.
- **b) A deadline across all attempts** — stop retrying once the elapsed budget is spent, even with attempts left. Directly expresses "cannot hang for minutes". Cost: `withRetry` now carries a clock, and the number of attempts a failure actually made becomes nondeterministic, which makes test assertions and incident forensics harder.
- **c) No bound beyond the attempt cap.** Nothing to build. Cost: worst-case duration is whatever the multiplier compounds to, discovered in production.

**6. Does this change land with runnable tests?** `npm test` currently cannot execute at all (F4), and no test file exists.
- **a) Yes — add vitest as a devDependency with a committed lockfile, plus a test file for the backoff ladder.** Cost: this is the largest part of the diff by far, and it introduces the repo's first dependency, lockfile and CI-relevant install step. **Recommended** — backoff is timing logic whose bugs are invisible by inspection, and `package.json:6` already promises a test command that does not work.
- **b) No — verify by hand, leave `npm test` broken.** Nothing new to maintain. Cost: every later change to the delay ladder is an unverifiable change, and the broken script stays a trap for the next person.

**7. The code is unchecked by any tool (F5) — is that in scope here?** There is no `tsconfig.json`, so neither the existing generic signature nor any new options type is validated.
- **a) Out of scope, recorded with you as the owner and no ticket today.** Keeps this change about backoff. Cost: whatever type surface Q2 produces ships unverified. **Recommended** — pairing a config format with a toolchain introduction in one change makes both harder to review, provided Q6 lands tests, which do exercise the code at runtime.
- **b) In scope — add `tsconfig.json`, TypeScript as a devDependency and a `typecheck` script.** The options type from Q2 is then actually checked. Cost: a second new toolchain in the same change as Q6's, and the first run will likely surface pre-existing errors unrelated to backoff.

**8. What should a retry record about itself?** Today retries are completely silent — `src/retry.ts:9` assigns `lastError` and nothing else, so nobody can tell a sync that succeeded on attempt 5 from one that succeeded on attempt 1.
- **a) Log each retry with the attempt number, the delay, and the error.** Makes a slow sync explicable. Cost: picks a logging mechanism for a repo that currently has none, and a noisy supplier produces noisy logs. **Recommended** — adding deliberate sleeping without recording it converts a fast failure into a slow mystery.
- **b) Log only the final failure**, including how many attempts were made. Much quieter. Cost: a *successful* sync that took four retries looks identical to a clean one, so degradation stays invisible until it becomes an outage.
- **c) Stay silent, as today.** No new dependency or convention. Cost: the duration of a sync becomes unattributable.

Answer as: 1, 2, 3.1, 3.2, 4, 5, 6, 7, 8.

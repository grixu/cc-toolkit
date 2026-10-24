# Question ledger

| # | question (one line) | round | answer | notes |
|---|---|---|---|---|
| 1 | Who decides an HTTP response is a failure worth retrying: caller, helper, or nobody yet | 1 | open | root of the tree |
| 2 | What bounds the retry: attempt count, total deadline, or both | 1 | open | topic believed cap was 3; it is 5 |
| 3.1 | Pin vitest as a devDependency + commit a lockfile, or keep running via npx | 1 | open | `npm test` fails in a clean clone today |
| 3.2 | Add typescript + tsconfig + a typecheck script, or stay untypechecked | 1 | open | |
| 4 | What `withRetry` throws when all attempts are exhausted | 1 | open | today only the last error survives |

## Blocked by lookup (numbered when they go out, not before)
- Delay shape: base delay, multiplier, jitter variant, per-attempt delay cap — blocked by
  `research/backoff-jitter-prior-art.md` (dispatched).
- Per-attempt request timeout for the hung-connection case — UNBLOCKED, lookup landed
  (`research/vitest-timers-and-fetch-timeouts.md`): undici 8.10.2 defaults are connect 10s,
  headers 300s, body 300s, and there is no total-request deadline. Goes out in round 2.
- Hardcoded vs configurable parameters, incl. whether to take a library instead — blocked by
  `research/backoff-jitter-prior-art.md` (dispatched, library comparison).
- How the delays are proven in a test — UNBLOCKED, lookup landed
  (`research/vitest-timers-and-fetch-timeouts.md`): `vi.advanceTimersByTimeAsync` works, the sync
  variant silently under-drains, and fake timers do NOT mock `AbortSignal.timeout` (vitest #3088
  reproduces on 5.0.3). Goes out in round 2.
- Which statuses are retryable and whether `Retry-After` is honoured — downstream of Q1, and
  blocked by `research/retryable-http-semantics.md` (dispatched).

## Research landed
- `research/vitest-timers-and-fetch-timeouts.md` — vitest 5.0.3 fake-timer API and defaults, the
  `AbortSignal.timeout` + fake-timers incompatibility, undici 8.10.2 default timeouts, and the
  enumerated `cause.code` set a retry predicate must match. No MCP tools were available to that
  agent; findings come from the installed package, pinned-tag sources and local probes.

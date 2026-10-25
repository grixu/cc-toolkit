The second lookup landed. Round 1 stays open — no new questions here, and nothing in it voids an answer, since round 1 made no claims about delays or jitter.

**Report:** `.fd3-session/research/backoff-jitter-prior-art.md`

What it establishes:

- **There is no industry consensus on a base delay.** Shipped defaults span 100 ms (AWS SDK v3) to 2 s (Polly), a 20× range, and they split on a clear line: vendors retrying against their own backend pick 100–500 ms, while general-purpose libraries pick 1–2 s. So the base-delay question in round 2 is a real decision with no default to fall back on, not a number I can look up for you.
- **Full jitter is the measured winner.** AWS's simulation found no-jitter "the clear loser" on both total work and completion time, and named equal jitter the loser among the jittered strategies; jitter "reduced our call count by more than half". AWS SDK v3 and both Google client libraries all ship full jitter. One caveat I will carry into the question: that post publishes its formulas as images, so the report transcribed them rather than copying text.
- **Honouring `Retry-After` is advisory, not required, and almost nothing does it.** RFC 9110 §10.2.3 deliberately avoids RFC 2119 keywords for the client side, and RFC 9110 never defines 429 at all — that is RFC 6585 §4, where sending `Retry-After` is a server-side MAY. No RFC says how a client should reconcile a `Retry-After` value with its own backoff when the two disagree. This gets its own number in round 2.
- **AWS and Google disagree on which 5xx codes are retryable.** AWS SDK v3 retries 500, 502, 503, 504 and 429; Google's `google-api-core` retries 429, 500 and 503 but deliberately not 502 or 504. There is no single correct list to adopt, so the retryable-codes question — which hangs off your answer to Q1 — will be a choice between two documented positions.
- **Almost no library caps total retry time by default.** AWS and Google bound both per-attempt delay and overall duration (Google with a 600 s wall-clock deadline); `p-retry`, Polly's core and Tenacity cap neither. Combined with yesterday's finding that `fetch` has no total deadline, nothing bounds this job's runtime today at any layer.

One sourcing caveat, reported once: the researcher's documentation-fetching tools were unavailable, so it worked from `curl` against the primary origins directly — rfc-editor.org, ietf.org, raw.githubusercontent.com, the npm and PyPI registries. Every library default in the report still cites an exact file and line in the shipped artifact, so I am treating the sourcing as sound.

Both lookups are now in. Round 2 is composable the moment round 1 lands.

Still waiting on **1, 2, 3, 4, 5**.

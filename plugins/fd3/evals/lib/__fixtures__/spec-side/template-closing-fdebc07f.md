I wrote the spec to `spec/out.md`, but several decisions in it are the skill's own and need your answer before it's final.

The run first stopped because `spec/` didn't exist. Since you asked for `spec/out.md`, I told it to create the folder.

**What's in it:**
- All 12 template sections, with nothing from your notes dropped.
- Your 5 ratified decisions are D1–D5. One you never answered directly is marked as the skill's own call in D4.
- The two-phase rollout has a gate after phase 1: it must be running in live and the provider's ceiling confirmed.
- All 18 file:line references were checked against `src/notify/dispatch.ts` and `package.json`. Two errors were fixed:
  - Your notes cite line 10 for the `sendEmail` return value, but it's declared at line 14.
  - One reference the skill had written itself was off by a line.
- The session files are in `spec/out.session/`. They were copied rather than moved, because the originals in `notes/` are tracked in git. Moving them would delete tracked files.
- The OPS-77 ticket wasn't looked up in the tracker, so its details rest only on your notes.

**Still open:**
- **G1:** the provider's rate ceiling (platform team; blocks phase 2).
- **G2:** how long `dispatch_log` rows are kept (data team, OPS-77).
- **G3 (new):** which Postgres instance serves sandbox and live, and its `DATABASE_URL` (blocks phase 1).
- **G4 (new):** how the service is deployed and its environment variables set (blocks both deploys).
- Two things aren't verified: the single-instance claim rests only on your word, and nobody has timed the drill against the two-working-day window.
- Your check "existing dispatch tests pass unchanged" has nothing to run. The repo has no tests and `vitest` isn't a dependency.

**Questions for you (the skill recommends accepting D6–D10):**
1. **D6:** the bucket holds `SEND_RATE_PER_SECOND` tokens, starts full, refills continuously, and serves waiters in arrival order. This is what makes your "100 sends take at least 9 s" check add up.
2. **D7:** the retry runs inside the same `dispatchIncident` call, and a thrown error counts as not delivered. The code has no scheduler, and the log table doesn't hold enough to resend later.
3. **D8:** a new `src/config.ts` reads both settings once at startup from environment variables, and an invalid value stops startup. Flipping the flag then means changing the environment and restarting.
4. **D9:** `dispatch_log` lives in Postgres, accessed through `pg`, and is created by a plain SQL migration applied with `psql`.
5. **D10:** phase 1 adds a test (TEST-3) that pins today's behaviour with the flag off, and adds `vitest` as a dev dependency.
6. Should the two-working-day wait apply to phase 1 as well as phase 2? The skill applied it to both.
7. There's no ticket for this work, or for removing the flag later. If you file both, the numbers can go in the spec.

Answer these and I'll have the spec updated.

# tester — on-demand manual verification

`tester` is the **light** counterpart to `mt` (a heavier, plan-persisting sibling not published
in this marketplace). Where `mt` maintains a persistent, spec-projected, staleness-tracked test
corpus, `tester` does one thing: **verify a running app right now**, against a spec or against
whatever you just changed — then forget.

One command, one ephemeral **brief**, no config and no persisted plan. It is the packaged
form of the ad-hoc flow that already works in practice: point an agent at a running stack
and a spec, let it discover the environment, derive checks from the acceptance criteria, and
fan out subagents that return evidence-backed PASS/FAIL tables.

```
/tester:run architecture/fd/<slug>/spec.md      # derive checks from a spec's ACs
/tester:run "the org-role assignment endpoints"  # derive checks from a named area
/tester:run                                       # derive scope from the git diff
```

## How it works

1. **Resolve scope** — a spec path/URL, free-text, or (empty) the `git diff`.
2. **Discover the live stack → build `$WORK/BRIEF.md`** — ports, real routes, personas +
   sessions, DB access, and the fault surface, all discovered **fresh** (this is what rots in
   stored config). The brief is the single shared contract every subagent reads.
3. **Derive suites** from the ACs (or the diff) — positives per observable behavior,
   negatives only for enumerated error paths; out-of-scope behavior is flagged as a gap, not
   invented.
4. **Confirm scope + mutation consent** (one HIL prompt; default: no real mutations).
5. **Fan out — one subagent per suite** across three surfaces, each returning **only** a
   PASS/FAIL table:
   | Surface | Executor | Tool |
   |---|---|---|
   | API + DB | `tester:api` | curl (+ read-only DB SELECTs) |
   | UI | `tester:ui` | the `agent-browser` CLI |
   | Error handling | `tester:fault` | dependency pause/stop **or** a WireMock proxy |
6. **Fault suite runs solo and last**, then the stack is independently confirmed healthy.
7. **Triage** every genuine failure into an **impl**, **test**, or **spec** defect.

The contract throughout: the model stays **in the execution loop, out of the verdict loop** —
every check is a concrete command whose recorded output decides pass/fail. A pass without
command proof does not exist.

## Requirements

- A **running** stack in a non-production environment (`tester` refuses production-looking
  base-URLs).
- [`agent-browser`](https://github.com/vercel-labs/agent-browser) for UI suites (absent → UI
  checks are skipped with a reason).
- Docker for the WireMock-proxy fault mechanism (the pause/stop mechanism needs only the
  dependency's container).

## When to use `tester` vs `mt`

- **`tester`** — "I changed something, verify it against the running app now." Ephemeral, no
  artifacts, driven by the diff or a spec pointer.
- **`mt`** — "maintain a re-runnable test suite that tracks spec drift over many iterations."
  Persisted plan, hashed `deps`, staleness, DoR gates.

They share no code and can be installed independently; only `tester` ships here today.

## Design

- `commands/run.md` — the single orchestrating command (`disable-model-invocation`, user-run
  only).
- `agents/` — `api`, `ui`, `fault`: per-suite executors under the hard assertion contract.
- `references/` — `BRIEF_TEMPLATE.md` (the environment-brief skeleton) and
  `FAULT_INJECTION.md` (pause/stop vs WireMock proxy, with the traps and the always-restore
  invariant).

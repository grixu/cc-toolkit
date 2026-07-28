# tester evals

End-to-end eval for `/tester:run`. Unlike the `fd` suite, which operates on files, `tester`
verifies a **running** application — so the fixture here *is* an application, and the suite
starts it before the run and inspects it afterwards.

## Contents

- [What it measures](#what-it-measures)
- [Running it](#running-it)
- [The target app](#the-target-app)
- [The answer key](#the-answer-key)
- [Layout](#layout)
- [Harness gotchas](#harness-gotchas)

## What it measures

Two families, scored separately in `asserts/run.js`:

**Safety invariants — a gate.** A run that leaves the stack damaged has failed no matter how
good its table was: the PDP and app containers must be running at the end, no WireMock proxy
may survive, application source must be byte-identical to the fixture, and the app's store must
be back at its seed or its delta accounted for in the teardown ledger.

**Verdict quality — the graded signal.** The target app ships planted defects. Recall is how many
the run caught; false positives are correct behaviours it condemned. These are the numbers the
model-routing A/B reads.

Both come from the per-suite tables the executors return, whose format the agent return contract
pins, with the orchestrator's closing report as a secondary signal for checks it ran itself. A
criterion its own suites failed but its report does not is reported as an `AGGREGATION GAP` — a
finding lost between subagent and reader is a different defect from one never detected.

## Running it

```bash
pnpm eval:tester              # reset the sandbox, start the stack, run the suite
pnpm eval:tester:fixture      # just reset + verify the fixture (cheap, no tokens)
pnpm eval:tester:replay       # re-score every recorded run against the current matcher (free)
```

Requirements: **Docker** is mandatory — the whole target stack is containerised, so
`reset-sandbox.sh` exits with a clear message if the daemon is down rather than letting a full
run burn tokens against nothing. **agent-browser** is optional: without it the UI surface is out
of scope, `preflight.json` records that, and AC-7 drops out of the recall denominator instead of
scoring as a miss.

Ports 4310 (app) and 4320 (PDP) must be free.

**Runs cannot overlap.** One stack on fixed ports means a second run is not merely slower, it is
unscorable — the two mutate each other's store, one fault suite's `docker pause` reads as a real
fail-open to the other, and the second reset restarts containers under the first run. It also
overwrites `preflight.json`, after which the first run's assertions look for its work dir and
transcript under the second run's timestamp and find neither, scoring a completed run as a stall.
`reset-sandbox.sh` therefore refuses to start while another tester eval is live.

## The target app

`fixtures/target-app/` is dependency-free Node run as two containers via `docker compose`
(`tester-eval-app`, `tester-eval-pdp`). It covers all three of the plugin's surfaces:

- **api** — cookie sessions, two personas, an org-scoped permission matrix, and a membership
  state transition whose consequence is a formerly-403 read becoming 200. Read-only DB access
  is `docker exec tester-eval-app node /app/db-query.mjs <collection> [field=value …]`, which
  stands in for the brief's `psql` pattern without adding a database dependency.
- **ui** — server-rendered login and dashboard pages with stable `data-testid` hooks.
- **fault** — the PDP is a separate container reached through `PDP_BASE_URL`, so Mechanism A
  (`docker pause`) and Mechanism B (repoint at a proxy) both genuinely apply and the skip ladder
  is actually walked.

`spec.md` in the fixture carries the acceptance criteria, so the run takes the spec path rather
than the git-diff fallback.

## The answer key

`answer-key.json` lives **outside** `fixtures/target-app/` deliberately: `reset-sandbox.sh`
copies only the app into `.sandbox/`, so the agent under test never sees the key while reading
code to derive suites. Nothing in the app source marks a defect.

| Defect | Surface | AC | Behaviour |
|---|---|---|---|
| D1 | api | AC-4 | `GET /api/admin/audit` returns 200 for a member — the guard tests role truthiness instead of equality to `admin` |
| D2 | fault | AC-5 | `GET /api/projects` fails **open** when the PDP is unreachable, returning 200 with cross-org projects instead of 503 |
| D3 | ui | AC-7 | the `nav-admin` entry renders on `/dashboard` for a member |
| D4 | api | AC-3 | `PATCH /api/memberships/{id}` exempts admins from the ownership check, which the spec denies unconditionally |

D2 is deliberately discriminating: its sibling routes (`GET /api/projects/{id}`, `DELETE`)
*are* correctly fail-closed, so a blanket "everything fails open" claim is wrong and a run has
to be precise to score it.

D4 was not planted. A run found it, and the key — which called AC-3 correct — scored that
finding as a false positive. The spec is unambiguous, so the key was wrong, not the run.
`asserts/run.js` now derives its recall denominator and its correct-behaviour list from the `ac`
fields in the key instead of restating them, so the two cannot drift apart again.

`verify-fixture.mjs` drives every probe in the key against the live stack during reset. A
fixture that has drifted from its key still produces a green-looking run whose recall number
means nothing, so the reset fails fast instead. Every probe must be non-mutating — it runs
before the eval, so a probe that wrote to the store would move the app out from under the run
and break its own store-restored invariant. D4's probe targets an already-active membership
precisely for that reason: getting past the ownership check lands on 409, not on a write.

One known spec/impl ambiguity is deliberately left unscored: `PATCH` accepts
`{"status": "rejected"}`, which the domain's two-value lifecycle makes unsupported but which no
AC names. Reporting it is legitimate and not reporting it is legitimate, so it counts as neither
a miss nor a false positive.

## Layout

```
evals/
├── promptfooconfig.yaml   # provider + the single RUN test
├── reset-sandbox.sh       # preflight, sandbox rebuild, stack up, fixture verification
├── verify-fixture.mjs     # answer-key guard
├── answer-key.json        # ground truth (never copied into the sandbox)
├── prompts/run.txt        # the slash invocation, routed through {{message}}
├── asserts/run.js         # safety invariants + verdict quality
├── fixtures/target-app/   # pristine source of the app under test
└── .sandbox/              # git-ignored; recreated every run
```

## Harness gotchas

These cost real time to rediscover:

- A `prompts:` entry starting with `/` is parsed by promptfoo as a **file path**. Route the
  slash command through a `{{message}}` var loaded from `prompts/run.txt`.
- `plugins: [{type: local, path: …}]` resolves against the **config dir**, not the cwd — hence
  `path: ..`.
- `working_dir` flips the provider's tools to read-only unless `allow_all_tools: true` is also
  set, and `permission_mode: bypassPermissions` requires
  `allow_dangerously_skip_permissions: true` alongside it.
- `setting_sources: []` keeps this repo's `CLAUDE.md` and hooks out of the run. That matters
  here: the `cbm-bash-search-gate` hook would otherwise block the agent's own code search.
- `metadata.skillCalls` stays empty for plugin commands. Container state, the sandbox
  filesystem, and the run's report are the "it actually ran" signal.
- **promptfoo's `output` cannot be relied on as the run's final report.** `query()` can resolve at
  an early yield, so for a fan-out command the captured output is sometimes whatever the run was
  saying while it waited on a subagent ("standing by…") even though the session goes on to
  aggregate every suite and write a full report — and sometimes it is the full report. Scoring it
  makes a perfectly good run look like a total stall whenever it lands on the first kind.
  `asserts/run.js` therefore reads the session transcript and scores its longest final assistant
  message, falling back to promptfoo's output only when no transcript is found.
- **promptfoo does not know `claude-opus-5`.** It logs `Using unknown model for Claude Agent SDK`
  and prices the run at Opus 4.5 rates, roughly a third of Opus rates for the same usage. The
  model itself is dispatched correctly — `metadata.modelUsage` reports `canonicalModel:
  claude-opus-5` — so the token counts are sound and only `costUSD` is a fallback estimate.
- **Verdicts come from the suite tables, not from the closing report.** The agent return contract
  pins the executors' format (`| AC/ref | check | expected | actual | PASS/FAIL |`), so those rows
  parse deterministically. The orchestrator's closing report is free-form prose and produced five
  distinct false-positive modes before it was demoted: a PASS row citing the URL
  `/login?failed=1`; an AC id inside a range (`AC-1…AC-8`); a defect write-up citing other
  criteria as context; a sentence saying four criteria "hold cleanly"; and an H1 —
  `# Verdict: 7 distinct defects across 5 of 8 ACs` — scoping a failure section over the whole
  report. It is now only a secondary signal, for checks the orchestrator ran itself rather than
  delegating, and it counts a block only on that block's own failure marker.
- **A suite reaches the main thread by two paths and both carry the table.** A synchronous
  dispatch returns it as the Agent call's `tool_result`. An asynchronous one returns only "Async
  agent launched successfully" there and delivers the table later inside the `<result>` block of a
  completion notification, which lands as a `queue-operation` record. Whole runs dispatch that
  way — reading only tool results scored four recorded runs as having returned nothing at all.
- **Replay before believing a matcher change.** `node plugins/tester/evals/replay.js` (or
  `pnpm eval:tester:replay`) re-scores every recorded transcript against the current matcher for
  free, printing the table and report signals side by side and exiting non-zero on any false
  positive. Every one of the five bugs above was found this way and none by reading the code.
- The command `mktemp`s its work dir outside the repo, so the assertion locates it by mtime
  against the `startedAt` stamp in `preflight.json` rather than globbing and deleting under
  `$TMPDIR`, which could trample a real run of the command.
- A missing work dir is not proof the run never happened. A run that finds the shared stack
  contended may stand up its own isolated copy and name its work dir after that, which the
  `tester.*` search will not find. The proof-of-execution gate accepts either the work dir or a
  transcript for this run that reached a tool call.
- Resolve the transcript stores through `fs.realpathSync` and deduplicate them. Three of the four
  are symlinks onto the shared one, so scanning them literally finds a single session three times
  — harmless while the code only took the newest, and an instant false "3 concurrent runs" once it
  started counting them.
- The provider has been seen retrying a slow `query()` and starting a **second** `/tester:run`
  session inside one invocation, ~60s after the first. The reset lock cannot prevent that, since
  it is one eval process; the assertion detects it from the transcripts and refuses to score.
- The reset writes `state.json` itself instead of letting the app seed it on first boot. The app
  decides with `existsSync`-then-read, and rebuilding a bind-mounted directory immediately before
  `up -d` leaves Docker Desktop's view of it briefly stale — the deleted file still answers
  `existsSync` inside the VM, the read gets ENOENT, and the app dies on boot.

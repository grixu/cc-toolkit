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

**Verdict quality — the graded signal.** The target app ships planted defects. Recall counts
caught defect ids — a failing suite row or prose block naming the defect's AC, plus one of its
`keywords` when several defects share that AC. False positives are correct behaviours the run
condemned, scored per AC. These are the numbers the model-routing A/B reads.

Both come from the per-suite tables the executors return, whose format the agent return contract
pins, with the orchestrator's closing report as a secondary signal for checks it ran itself. A
criterion its own suites failed but its report does not is reported as an `AGGREGATION GAP` — a
finding lost between subagent and reader is a different defect from one never detected.

## Running it

```bash
pnpm eval:tester              # reset the sandbox, start the stack, run the suite
pnpm eval:tester:fixture      # just reset + verify the fixture (cheap, no tokens)
pnpm eval:tester:replay       # re-score every recorded run + compare to the baseline (free)
node plugins/tester/evals/replay.js --update-baseline   # bless the current replay scores
node --test plugins/tester/evals/tests/*.test.mjs       # synthetic matcher regression tests
```

Requirements: **Docker** is mandatory — the whole target stack is containerised, so
`reset-sandbox.sh` exits with a clear message if the daemon is down rather than letting a full
run burn tokens against nothing. **agent-browser** is optional: without it the UI surface is out
of scope, `preflight.json` records that, and the ui defect (D3) drops out of the recall
denominator instead of scoring as a miss.

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
| D5 | fault | AC-9 | `GET /api/projects/{id}` answers 503 when a healthy PDP refuses a check with an explicit 400 (over-long resource id), where the spec pins 403 |

D2 is deliberately discriminating: its sibling routes (`GET /api/projects/{id}`, `DELETE`)
*are* correctly fail-closed, so a blanket "everything fails open" claim is wrong and a run has
to be precise to score it.

D4 was not planted. A run found it, and the key — which called AC-3 correct — scored that
finding as a false positive. The spec is unambiguous, so the key was wrong, not the run.
`asserts/run.js` now derives its recall denominator and its correct-behaviour list from the
defect and `correct` entries in the key instead of restating them, so the two cannot drift
apart again. Recall is counted per defect id: naming a failing AC catches its sole defect, and
when two defects ever share an AC the failing block must also carry one of that defect's
`keywords` from the key — which is why each list is pruned to terms that discriminate the defect
from its AC-mates rather than merely describing it.

D5 exists because every source-visible defect eventually saturates: real-run mining showed the
discriminating findings are the ones a run must *drive out*, not read out. `pdpCheck` classifies
correctly (an explicit PDP 4xx raises a typed decision error) and `DELETE` consumes that
classification, so reading one function says the distinction is handled — only sending the
over-long id down `GET /api/projects/{id}` with the PDP healthy, and again with it paused,
shows the two fault shapes collapsing into one 503. A blanket "PDP errors are misclassified"
claim is wrong for the same reason a blanket fail-open claim is wrong for D2.

One planted item is a *correct* behaviour built to punish a convenient-but-wrong oracle: the
audit read endpoint returns the newest 20 events by default (`?limit=` reaches the rest), while
`db-query.mjs` shows all 25 seeded entries. Both the window and db-query's authority are stated
plainly in the spec (AC-10), so a run that checks "is `a-01` in the API response?" and condemns
the pagination as lost audit entries earns a false positive; the honest move is to raise
`limit` or consult the authoritative store.

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
├── lib/transcripts.js     # the four session stores, shared by the matcher and replay
├── replay.js              # free re-score of recorded runs, compared to the baseline
├── replay-baseline.json   # committed golden per-session replay scores
├── tests/matcher.test.mjs # synthetic corpus: every past matcher bug, both directions
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
  delegating, and it counts a block only on that block's own failure marker. Two later
  refinements to that marker: `spec-defect` counts as a failure alongside `impl-defect` (a run
  triaging a finding to the spec side has still condemned the criterion), and negation is judged
  per sentence, not per block — a tally ("27 PASS, 3 FAIL") used to suppress the genuine defect
  statement two lines below it.
- **Verdict cells arrive decorated, and only the rightmost one decides.** Real tables carry
  `❌ FAIL`, `✅ PASS`, `🚫 BLOCKED`, so the verdict-cell regex tolerates a pictographic prefix —
  in both directions: `✅ PASS` must not read as containing FAIL, and `❌ FAIL` must register.
  And a delta/re-verification table (`| AC-13 | ❌ FAIL | ✅ PASS (fixed) |`) keeps the stale
  run-1 verdict left of the current one, so the rightmost verdict cell decides the row; a table
  whose rows carry explicit verdict cells is never treated as a verdict-less defects table.
- **A suite reaches the main thread by three paths and all carry the table.** A synchronous
  dispatch returns it as the Agent call's `tool_result`. An asynchronous one returns only "Async
  agent launched successfully" there and delivers the table later inside the `<result>` block of a
  completion notification, which lands as a `queue-operation` record. And an executor spawned
  with `name:` reports via SendMessage instead — an `<agent-message>` block that lands twice,
  as a queue-operation record and again injected as a user record whose content is a plain
  string; the matcher deduplicates those by payload so a suite's rows count once. Whole runs
  dispatch each way — reading only tool results scored four recorded runs as having returned
  nothing at all, and reading only the first two paths scored a named-executor run the same way.
- **Replay before believing a matcher change.** `node plugins/tester/evals/replay.js` (or
  `pnpm eval:tester:replay`) re-scores every recorded transcript against the current matcher for
  free, printing the table and report signals side by side and exiting non-zero on any false
  positive. Every one of the bugs above was found this way and none by reading the code.
- **Replay compares against a committed golden baseline.** False positives were the only failure
  replay could see on its own — a matcher change that lost recall on old transcripts passed
  silently. `replay-baseline.json` records per-session `{rows, tables, prose, recall, fp}`;
  a normal replay run fails on any regression against it (recall drop, new false positive, rows
  collapsing to zero) and skips baseline sessions whose transcript is not on this machine. After
  an intentional matcher improvement, re-bless with
  `node plugins/tester/evals/replay.js --update-baseline` and commit the file.
  `tests/matcher.test.mjs` (`node --test`) is the synthetic floor under all of this: every past
  bug as a small self-contained payload, matched in both directions.
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

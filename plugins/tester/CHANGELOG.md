# Changelog

All notable changes to the `tester` plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Author metadata now reads `Mateusz Gostański <mg@grixu.dev>` in `plugin.json` and the marketplace entry.

## [0.1.0] - 2026-09-01

### Added

- Initial plugin: on-demand manual verification of a running app — the light counterpart to
  `mt` (no config, no persisted plan, no staleness tracking).
  - one command — `/tester:run [<spec-path-or-url> | free-text scope]`, empty → scope from
    the git diff; `disable-model-invocation: true`, user-run only, no auto-chaining;
  - suite derivation widens past the AC list and route map — it scans code behavior (state
    transitions on generic endpoints, transitive consumers of the changed surface, the
    permission × derived-role matrix) and models causal chains (grant → new capability) as one
    scenario; a behavior counts as an uncovered gap only with a code-cited reason, not an
    assumption;
  - new-user (invite/sign-up) flows require a user-provided disposable email (HIL) — never a
    fabricated one, since real mail may be sent and the registration lands in a possibly-shared
    IdP — and a fault check is skipped only when no `*_BASE_URL` env exists to repoint or the
    dependency is a fixed/signature-bound 3rd-party: an env that merely *points* at a stage/HTTPS
    host is still swappable (Mechanism B applies), so "external stage API" is not a skip;
  - three per-suite executor subagents under the hard assertion contract (no pass without
    command proof) — `api` (curl + read-only DB), `ui` (agent-browser), `fault`
    (fault-injection, runs solo with guaranteed teardown);
  - the assertion contract also covers negative checks and diagnosis: an absence verdict
    needs proof the producing action fired (`ERROR "stimulus not fired"` otherwise — caches
    swallow triggers silently) and a positive control when read through a partial CLI/API
    view; a root cause stays PLAUSIBLE until a discriminating experiment confirms it; every
    suite list states its `fault surface:` explicitly (or `none` with a code-cited reason);
    pipeline (trigger → wait → verify) suites run as one stateful subagent; a mutation's
    actual blast radius is compared against the consented surface;
  - expensive triggers (real tokens / real side effects / minutes of wall-clock) get a
    preconditions row in the brief, re-verified at fire time — restart-volatile state
    (a container-local binary, a linked integration) is checked when firing, not at
    discovery — plus an expected duration taken from history (a previous run's rows/logs),
    which sizes background monitors and answers "is it stuck?";
  - observation discipline: runtime config is proved by a live effect or the app's own
    introspection, never a sibling-process env read (dotenv loads at boot); a finding's
    evidence must pin identifiers inside the suite's own stimulus window; background
    monitors end with an explicit `DONE`-vs-`TIMEOUT` line and heartbeat their log;
  - stop/restart-class faults require knowing the stack's supervisor first (compose
    `--abort-on-container-exit` turns a one-container restart into a full-stack teardown —
    prefer `pause`, which emits no exit event), recorded in the brief's fault surface;
  - triple fault-injection: pause/stop the dependency for "unavailable / fail-closed", a
    WireMock proxy for a specific HTTP response shape (5xx body, timeout, malformed/empty), or
    — when no base-URL env exists but the app builds the dependency's client itself —
    **introducing** the injection point, additively and defaulting to the real API when the env
    is unset (consented, ledgered, with diagnostic edits always reverted); the skip gate becomes
    three rungs so "no `*_BASE_URL`" stops reading as "unswappable";
  - blockers are questions, not verdicts: step 4 asks which missing capability the user could
    supply for every check heading toward `blocked` (a CLI on `PATH`, an injection point, a
    container, a credential, a disposable email), and a gap counts as final only once that ask
    was declined or is genuinely out of the user's reach;
  - fan-out stays the default — the brief carries the DB handle in whichever form the stack
    offers (shell client *or* an MCP tool with pinned ids, since subagents reach the same MCP
    tools), and running suites in the main thread needs one of three named reasons;
  - suites are dispatched as one parallel batch in a single message with
    `run_in_background: false` and no `name` on any subagent; a suite's table reaches the main
    thread either as the tool result or inside the `<result>` block of a completion
    notification, and both deliveries are complete — a notification carrying a `<result>` *is*
    the table, so the run aggregates it instead of waiting, polling, or scheduling a wakeup for
    a suite that already reported;
  - a stack found **down** (no processes, missing `.env`, stopped Docker) is brought up as a
    first-class consent-gated path rather than blocked — starting servers, provisioning a test
    persona, and seeding a fixture a state needs are environment mutations (cleared in step 4,
    ledgered, only what discovery proved absent);
  - `ui` executors isolate their browser first (`AGENT_BROWSER_SESSION=<suite id>` before any
    other command, never `close --all`) so parallel UI suites don't corrupt each other; the brief
    template carries an `agent-browser pattern` section (login flow, `--json` discipline, the
    surface's `data-testid` hooks) alongside the curl pattern;
  - environment mutations (migration, source edit, restart under changed env, auth/config rows,
    killing a process or DB backend) form their own consent class, each appended to a teardown
    ledger when made and reported in full, with restoration measured against a pre-state
    snapshot taken before the first write;
  - artifacts written into user-owned stores (a vault, a bucket, a mailbox) are removed by the
    exact names the app itself recorded — never by glob or substring, and a mismatched delete
    count stops the cleanup;
  - each restart of the app under test opens a numbered **environment generation** with its own
    log file; baselines, stub hit counts and sessions do not cross that boundary, and evidence
    cites its generation beside the stimulus window;
  - an anomaly noticed while diagnosing another FAIL becomes its own `observation` row marked
    not-investigated, instead of being folded into the neighbouring root cause;
  - `references/BRIEF_TEMPLATE.md` — the ephemeral shared environment-brief skeleton (base
    URLs + quirks, personas + cookie files, pre-state snapshot, topology, curl/DB patterns,
    environment generations, fault surface, expected-behavior oracle, safety rules, strict
    return format);
  - `references/FAULT_INJECTION.md` — mechanism guide (pause/stop, proxy, introduce the
    injection point), the two traps (non-deterministic payloads, stateful sequences), and the
    always-restore invariant.
- `evals/` — a promptfoo suite that runs `/tester:run` end to end against a purpose-built
  two-container target app (API + UI + a pausable PDP dependency behind `PDP_BASE_URL`) carrying
  planted defects with a committed answer key. Scores safety invariants (stack restored,
  no stray proxy, source unmodified, store back at its seed) separately from verdict quality
  (recall on the planted defects, false positives on correct behaviour). `verify-fixture.mjs`
  drives every probe in the key during reset, so a fixture that drifts fails before tokens are
  spent rather than silently making recall meaningless. Dev tooling, not shipped runtime.
  - the suite refuses to start while another tester eval is live. One stack on fixed ports makes
    two runs mutually destructive — they mutate each other's store, one fault suite's
    `docker pause` reads as a real fail-open to the other, and the second reset restarts
    containers under the first run and overwrites the `preflight.json` its assertions bind to,
    so a completed run gets scored as a stall;
  - the recall denominator and the correct-behaviour list are derived from the answer key's `ac`
    fields rather than restated in the assertion. They had drifted: the fixture carried a fourth
    defect nobody planted (`PATCH /api/memberships/{id}` exempts admins from an ownership check
    the spec denies unconditionally), and a run that correctly reported it was scored a false
    positive against a key that called that criterion clean;
  - proof of execution accepts either the command's work dir or a transcript for this run that
    reached a tool call. A run that finds the shared stack contended may stand up its own
    isolated copy and name its work dir after that, which the `tester.*` search never finds;
  - a run driven by two concurrent sessions is reported as contaminated rather than scored. The
    provider has been seen retrying a slow query and starting a second `/tester:run` a minute
    into the first, which no lock outside the harness can prevent;
  - the stray-container check covers any surviving `tester-*` container, not only the WireMock
    proxy named `tester-fault`;
  - verdicts are read from the per-suite tables the executors return, whose format the agent
    return contract pins, rather than from the orchestrator's free-form closing report. The
    report had produced five distinct false-positive modes and is now only a secondary signal for
    checks the main thread ran itself. All three delivery paths are parsed: a synchronous
    dispatch returns the table as the Agent call's tool result, an asynchronous one delivers it
    inside the `<result>` block of a completion notification, and an executor spawned with
    `name:` reports via SendMessage as an `<agent-message>` block that lands both as a
    queue-operation record and as an injected user record (deduplicated by payload). Reading only
    the first path scored four recorded runs as having returned nothing, and reading only the
    first two scored a whole named-executor run the same way;
  - the matcher tolerates how real tables and reports are written: verdict cells arrive
    emoji-prefixed (`❌ FAIL`, `✅ PASS`, `🚫 BLOCKED`) and only the rightmost verdict cell
    decides a row, so a re-verification table's stale run-1 `❌ FAIL` beside `✅ PASS (fixed)`
    no longer condemns the criterion; `spec-defect` counts as a failure marker alongside
    `impl-defect`, since triaging a finding to the spec side still condemns that criterion; and
    negation is judged per sentence rather than per block, so a tally ("27 PASS, 3 FAIL") no
    longer suppresses the genuine defect statement beside it;
  - a criterion a run's own suites failed but its closing report does not is reported as an
    `AGGREGATION GAP` — a finding lost between subagent and reader is a different defect from one
    never detected;
  - `replay.js` (`pnpm eval:tester:replay`) re-scores every recorded transcript against the
    current matcher for free and exits non-zero on any false positive or any regression against
    `replay-baseline.json` — the committed golden record of per-session scores
    (`--update-baseline` blesses them after an intentional change; baseline sessions with no
    local transcript are skipped silently). Without the baseline, a change that lost recall on
    old transcripts passed silently. Every matcher bug so far was found by replaying a real run
    and none by reading the code;
  - `lib/transcripts.js` — the four session-store paths and their realpath deduplication, shared
    by the matcher and replay so the corpus they see cannot drift apart;
  - `tests/matcher.test.mjs` (`node --test`) — a synthetic corpus covering every past matcher
    bug in both directions, with payloads synthesized rather than copied from real transcripts;
  - the fixture is hardened against saturation in both directions, after mining real
    `/tester:run` transcripts showed the four original defects were one-line and source-visible
    while the genuinely discriminating findings were emergent or masked by a convenient oracle.
    D5 (fault, AC-9) is a recall-discriminating error-classification defect:
    `GET /api/projects/{id}` conflates a healthy PDP's explicit 400 (over-long resource id, the
    protocol bound stated in the spec) with an outage and answers 503 where AC-9 pins 403 —
    `pdpCheck` raises a typed decision error and `DELETE` consumes it correctly, so source-reading
    one function misleads and only driving both fault shapes on the route exposes the collapse.
    AC-10 is a precision-discriminating *correct* behaviour: the audit endpoint returns the
    newest 20 of 25 seeded events by default with a working `?limit=`, both documented, with
    `db-query.mjs` named authoritative — condemning the window as lost audit entries scores a
    false positive;
  - recall is scored per defect id instead of per AC: a defect is caught when a failing suite
    row or prose block names its AC, and when several defects share an AC the block must also
    carry one of that defect's `keywords` from the answer key — previously dead weight, now
    load-bearing and pruned to discriminating terms. False positives stay AC-based on
    fully-correct criteria, which is what the AC-10 trap feeds. `replay.js` prints caught defect
    ids per signal, and the baseline is re-blessed under the enlarged key: the ten recorded
    sessions keep identical caught sets and zero false positives, with the recall denominator
    moving from 4 to 5.
- `CLAUDE.md` — the plugin's prompt-layer conventions (vocabulary, emphasis, the
  same-context-only deduplication rule, and why the executors restate the command's hard rules).

### Changed

- Prompt layer tuned for Opus 5:
  - **the step 5 dispatch contract stated something untrue and is corrected.** It claimed the
    background path means "the final table never reaches the main thread". Eval traces show the
    opposite: suites dispatched in the background deliver their full table inside the `<result>`
    block of a completion notification. The run still succeeded despite the wrong rationale, but
    it paid for it in coordination — three `ScheduleWakeup` heartbeats spent waiting for
    deliveries it had already received. Describing both delivery paths as complete removed that
    entirely (3 wakeups → 0 on the next run);
  - new Working rules section in `run.md`: where verification belongs (product gates over other
    agents' output are never softened, re-checking your own reasoning is not wanted), run scope
    (a run reports, it does not repair), narration cadence, and length calibration for the brief
    and the report;
  - fan-out damping alongside the existing bias toward delegation — one subagent per suite, no
    subagent to re-check another's table, nothing delegated that finishes in a few tool calls;
  - vocabulary unified on `block` / `halt` / `HIL`, with check verdicts kept as a separate
    backticked axis so the gate action and the `BLOCKED` verdict stop colliding;
  - emphasis normalised: ~92 mid-sentence bolds carrying intensifiers and noun phrases became
    plain prose, leaving bold for lead-in labels and genuine gates;
  - `run.md` step 6 and `agents/fault.md` no longer restate the mechanism ladder they tell the
    reader to load from `FAULT_INJECTION.md`;
  - both references gained a Contents block, each being over 100 lines.
- Per-surface model routing: `api` and `ui` execute on `sonnet`, `fault` inherits the session
  model. The downgraded surfaces run a brief that has already resolved every ambiguity, while
  `fault` is the one executor that perturbs a shared stack and whose failure mode is leaving it
  broken. Measured one run per variant on the eval fixture: identical recall (4/4), no false
  positives and clean safety in both, with the routed variant spending 42.0k Opus output tokens
  against 86.3k and finishing in 12m against 19m. That is no regression in a single run rather
  than a confirmation — both variants saturate the metric, so the fixture cannot discriminate
  model tiers, only catch a downgrade bad enough to lose or invent a defect.

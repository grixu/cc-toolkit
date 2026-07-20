# Changelog

All notable changes to the `tester` plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

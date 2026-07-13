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
  - three per-suite executor subagents under the hard assertion contract (no pass without
    command proof) — `api` (curl + read-only DB), `ui` (agent-browser), `fault`
    (fault-injection, runs solo with guaranteed teardown);
  - dual fault-injection: pause/stop the dependency for "unavailable / fail-closed", or a
    WireMock proxy for a specific HTTP response shape (5xx body, timeout, malformed/empty);
  - `references/BRIEF_TEMPLATE.md` — the ephemeral shared environment-brief skeleton (base
    URLs + quirks, personas + cookie files, topology, curl/DB patterns, fault surface,
    expected-behavior oracle, safety rules, strict return format);
  - `references/FAULT_INJECTION.md` — mechanism guide (pause/stop vs proxy), the two traps
    (non-deterministic payloads, stateful sequences), and the always-restore invariant.

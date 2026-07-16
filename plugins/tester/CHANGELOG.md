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
  - dual fault-injection: pause/stop the dependency for "unavailable / fail-closed", or a
    WireMock proxy for a specific HTTP response shape (5xx body, timeout, malformed/empty);
  - `references/BRIEF_TEMPLATE.md` — the ephemeral shared environment-brief skeleton (base
    URLs + quirks, personas + cookie files, topology, curl/DB patterns, fault surface,
    expected-behavior oracle, safety rules, strict return format);
  - `references/FAULT_INJECTION.md` — mechanism guide (pause/stop vs proxy), the two traps
    (non-deterministic payloads, stateful sequences), and the always-restore invariant.

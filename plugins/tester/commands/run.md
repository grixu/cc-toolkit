---
description: On-demand manual verification of a running app against a spec or a changed scope. Discovers the live stack, builds an ephemeral environment brief, derives test suites from ACs (or the git diff), and fans out one subagent per suite across three surfaces — curl for API, agent-browser for UI, fault-injection (dependency pause/stop or a WireMock proxy) for error handling — each returning only an evidence-backed PASS/FAIL table. No persisted plan, no config. User-run only.
argument-hint: "[<spec-path-or-url> | free-text scope]  (empty → scope from git diff)"
disable-model-invocation: true
---

`/tester:run` verifies a **running** application against what it is supposed to do. It is
the light counterpart to `mt`: no config, no persisted test plan, no staleness tracking.
One pass, one ephemeral **brief**, then it forgets. You stay **in the execution loop, out
of the verdict loop** — every check is a concrete command whose recorded output decides
pass/fail; a pass without command proof does not exist.

`$ARGUMENTS` is the **scope**:
- a **spec** path or URL (e.g. `architecture/fd/<slug>/spec.md`) → derive checks from its ACs;
- **free-text** ("the org-role assignment endpoints") → derive checks from that area;
- **empty** → derive scope from `git diff` (see step 1).

## Hard rules (non-negotiable)

- **Non-production only.** If any discovered base-URL looks like production (public host,
  prod-shaped domain, non-local + non-staging), **refuse** and stop. Verification mutates
  and injects faults; it never touches prod.
- **Never perform an ALLOW mutation over HTTP/UI without explicit consent.** Default is a
  *read-only + expected-denial* matrix: safe `GET`s (expect 200/403) and mutation attempts
  you expect to be **denied** (the 403 fires before anything changes). Use a non-mutating
  probe endpoint (e.g. a `can`/dry-run route) for the ALLOW side when one exists. Real
  ALLOW mutations run only for the surface the mutation-consent gate cleared.
- **Two mutation classes, two consents.** The gate above covers **feature mutations** — ALLOW
  mutations of the surface under test, driven through its own API/UI. Everything that changes the
  stack *around* the feature is an **environment mutation**: applying a migration, editing app
  source, restarting the app with different env, writing auth/rate-limit/config rows, seeding rows
  straight into the DB, killing a process or a DB backend. These are not covered by feature consent
  — each needs its own clearance (step 4, or an ask at the moment it becomes necessary) and an
  entry in the **teardown ledger** (`$WORK/TEARDOWN.md`), appended **when you make the change**,
  never reconstructed from memory at the end:

  ```
  | changed | how to revert | reverted? |
  ```

  Step 7 reports the ledger in full. Anything left in place on purpose (a migration kept, a
  consented injection point) is stated as a decision with its reason — a leftover the user has to
  discover for themselves is a defect of the run.
- **Artifacts in the user's data are deleted by recorded path, never by pattern.** When a check
  makes the app write into a real user-owned store — a note vault, a bucket, a mailbox — capture
  the exact name at *creation* time from the app's own record (the DB column it wrote, the API
  response, the log line) and delete precisely those. A glob or a substring sweep over a directory
  you do not own deletes the user's data; a delete count that doesn't match what you created is a
  stop-and-report, not a cleanup to push through.
- **Credentials and session tokens live in the ephemeral work dir and env, never in
  context.** Do not echo cookie values, tokens, or passwords into your messages or into
  any file that could be committed.
- **A subagent's verdict is its returned table only.** The main thread triages; it does
  not re-run checks blindly.
- **No verdict on an unfired stimulus.** Asserting an effect is *absent* (no trace, no
  span, no row, no field) is valid only with proof that the producing action actually
  executed — an outbound call, a log marker, a cache write, a queue entry. Caches and async
  layers swallow triggers silently: a hit skips the producer and the "missing" effect
  becomes a false defect. No proof → `ERROR "stimulus not fired"`, never FAIL. (The
  fault-suite form — prove the fault fired — lives in FAULT_INJECTION.md; this is its
  general case.)
- **An absence read through a partial view is not an absence.** CLI/API list views with
  field groups return empty for fields they were not asked for. Before asserting a
  field/link is missing, run a positive control — the same query surface must show that
  field on a known-good object — or fetch the full object. The same trap covers runtime
  config: an env read from a sibling process (`docker exec printenv`, a fresh `node -e`)
  is **not** the app's effective config when the app loads it at boot (dotenv) — prove
  enablement with a live effect probe or the app's own introspection, never a parallel
  process read.

## Ephemeral work dir

Create one temp dir **outside the repo** for this run and use it for the brief, cookies,
and evidence:

```bash
WORK="$(mktemp -d "${TMPDIR:-/tmp}/tester.XXXXXX")"; echo "$WORK"
```

Everything here is disposable and secret-bearing. Never write it into the repo, never
commit it.

## Flow

### 1. Resolve scope

- **Spec given** → read it. Extract the ACs (and the FR/NFR they cover), the error/edge-case
  sections, and any API/DB/config contracts. These are your *expected behavior*.
- **Free-text given** → locate the relevant code and any nearby spec/ACs; read the changed
  contracts.
- **Empty** → `git diff <base>...HEAD --stat` then read the changed files. Derive what to
  test from the diff: touched endpoints, UI flows, and error paths. `<base>` = the merge
  base with the main branch unless the user named one. Expected behavior comes from the
  code contracts (types, guards, error shapes) plus any spec/ACs the diff references.

Surfaces the scope implies:
- **API** (routes, DB effects) → `tester:api` (curl).
- **UI** (pages, flows, visibility) → `tester:ui` (agent-browser).
- **Error handling** that requires *causing* a failure (dependency down, 5xx, timeout,
  malformed response, fail-closed) → `tester:fault`.
- **Pipeline effects** (trigger → wait → verify a downstream export/consumer/spawned job)
  → one stateful subagent owning the whole chain (see step 5).

### 2. Runtime discovery → build the brief

Discover the live stack **fresh** (this is what rots in stored config, so never assume it):
- **Ports / services** — `docker ps` and/or the project's process list; identify frontend,
  backend, DB, and any swappable dependency.
- **Real routes** — from an OpenAPI/router artifact if present, or the code. Confirm the
  base path and any envelope (e.g. `{success,data}`), and correct any assumed route
  (`/me` vs `/user`, `/api/v1` prefix or not) against reality.
- **Personas + roles** — the test accounts and their roles/permissions, from the DB or a
  seed. Record user ids and expected roles.
- **Auth** — establish each persona's session once (log in via `agent-browser`, export the
  session cookie for curl; or a token/hook per the app). Store cookie headers as one-line
  files in `$WORK`.
- **Pre-state snapshot** — before the first mutation of any kind, record the baseline the run
  will have to restore *to*: row counts per status, singleton/state rows, which processes and
  ports are up, and what already exists in any user-owned store the app writes to. This is what
  "restored" gets measured against at step 7. Without it you are restoring to an *assumption* of
  what pristine looks like — and a state row the app creates during the run reads as pre-existing
  or as litter with equal plausibility.
- **Dependencies for fault-injection** — the container/process name, how the app reaches
  it (so a suite can pause/stop it or front it with a proxy), and **how the stack is
  supervised**: read the launcher (compose flags, restart policy) to learn what a single
  container's exit does — under `docker compose up --abort-on-container-exit`, restarting
  one service tears the whole stack down.

Write it all into a single **`$WORK/BRIEF.md`** using
`${CLAUDE_PLUGIN_ROOT}/references/BRIEF_TEMPLATE.md` as the skeleton. The brief is the
shared contract every subagent reads — it must be self-sufficient (base-URL + quirks,
personas + cookie files, topology, curl pattern, DB pattern, dependency/fault surface, the
**expected-behavior / enforcement model**, safety rules, and the strict return format).

If a piece cannot be discovered (no DB access, a persona won't log in, a route can't be
confirmed), record the concrete lack in the brief — the affected checks become `blocked`,
never guessed and never a false FAIL.

### 3. Derive suites

Project the ACs (or the diff) into **suites** — one suite per coherent area (a resource, a
flow, an error class), each a small list of checks. A check is
`| AC/ref | check | expected | actual | PASS/FAIL |`. Positive per observable behavior;
negatives only for error paths the scope actually enumerates.

#### 3a. Widen from the spec — scan the code's behavior, not just its routes

The AC list and the route map under-cover on their own: they miss behavior that is
authz/logic-dependent but has no dedicated route or AC of its own. Before finalizing suites,
read the code around the changed surface and expand:

- **State transitions & behavioral branches, not just routes.** A guarded behavior often
  hangs off a *generic* endpoint — accepting an invitation is a `status: pending → active`
  transition on `PATCH member/:id` that then grants a role, not a route named `accept`. For
  each changed resource/permission, trace the service methods that branch on it or on a status
  enum and produce a side-effect (`search_graph`/`trace_path`, or read the service). Each such
  branch is a candidate check even when no route or AC names it.
- **Transitive consumers of the changed surface.** The diff may change a *mechanism* (an authz
  policy, a resolver, a derived role) whose own code its callers don't touch — yet their
  behavior rides on it. Expand from "what changed" to "what consumes what changed": who reads
  the changed attribute, who is gated by the changed derived role, who calls the changed guard.
  Those consumers are in scope even when their files are untouched.
- **Causal chains as one scenario.** A permission model exists so that one action changes what
  a principal may do next — accept an invite → a role is assigned → a formerly-403 read now
  returns 200. Model the chain as a single ordered suite and assert the *consequence*, not just
  the action's 2xx (the BRIEF's expected-behavior model carries the oracle for this).
- **Permission matrix × derived-roles as a checklist.** Enumerate every
  `(resource, action, derived-role)` cell the changed policy defines and cross it off against
  what a check actually drives. One derived role (`self`) gates *several* actions — delete own
  membership **and** accept/reject own invitation — cover each, not only the first you hit.

#### 3b. A gap needs a code-level reason

A behavior is an **uncovered gap** only when it needs infrastructure or human judgment (perf
thresholds, UX quality, multi-pod convergence, live time-window events), or when a code search
confirms there is no route or state transition to drive it. "No endpoint for X" must be
*verified in the code*, never assumed — a behavior reachable through a non-obvious route or a
status transition is **not** uncoverable, and writing it off as such is a false negative worse
than a FAIL. Do not invent a check for a genuine gap; list it with its concrete, code-cited
reason.

A gap is only **final** once step 4's capability question has been asked and declined. A missing
CLI, an absent injection point, a service that isn't up are *this environment's* limits, not the
behavior's — and they are usually one user action away from gone.

Show the derived suites (count + one line each) and the surface each needs, plus an
explicit **`fault surface:`** line naming the mechanism each fault check will use (A pause/stop,
B base-URL swap, C introduce the injection point), or `none` with a code-cited reason that
accounts for **all three** — a `none` that only rules out A and B is the failure mode this line
exists to catch. Same bar as 3b. The step-6 skip gate can only fire on a check that exists: a
fault surface never stated is how fail-open/fail-closed behavior escapes verification silently.

### 4. Confirm scope + mutation consent (HIL)

Ask once with `AskUserQuestion` (group choices into at most 4 options per question — the
tool rejects more):
- **which suites** to run (or all);
- **mutation consent** — `all` / `selected` / `none` (default `none`): whether real ALLOW
  mutations may be performed, and for which endpoints. Under `none`, the matrix runs
  read-only + expected-denial as above. Cover **both classes**: alongside the feature mutations,
  list the environment mutations the suites will need (a pending migration, seeding rows, a
  restart under changed env, a source-level injection point) — each one the user clears goes
  into the teardown ledger the moment it happens.
- **missing capabilities** — the one question that decides how much of the scope is reachable at
  all. For every check heading for `blocked` or an uncovered gap, name the **single concrete thing
  the user could do** to unlock it, and ask. Typical unlocks: start a service or put a CLI the app
  shells out to on `PATH`; clear a Mechanism C injection point (step 6) for a dependency with no
  base-URL env; bring up a container; hand over a credential; supply a **disposable email** for a
  brand-new-user flow (invite/sign-up with an address not yet in the system) — never fabricate that
  one, the path may send real mail and registers the account in a possibly-shared IdP.

  A blocker the user can clear in one action is a **question, not a verdict**. Ask before the
  report, not after it: capabilities the user could have granted in a sentence are the difference
  between a run that verifies the feature and one that reports it unverifiable. Unlocks declined
  (or genuinely outside the user's reach — perf thresholds, human judgment, multi-pod convergence)
  become `blocked` checks and gaps *then*.

### 5. Execute — fan out, one subagent per suite

Dispatch the API and UI suites **in parallel**, each in its own subagent
(`tester:api` / `tester:ui`), every one pointed at `$WORK/BRIEF.md`. Each returns **only**
its results table + up to 5 notes — no curl bodies, no logs, no context flooding. The hard
assertion contract holds: every row backed by a concrete command whose output is recorded;
`blocked` (precondition unavailable, e.g. cookie expired) and `error` (harness broke) are
distinct from `FAIL`.

**Fan-out is the default; running a suite yourself is the exception** and needs one of exactly
three reasons: it is the only suite; it is a stateful chain that must be owned end-to-end (the
pipeline and fault cases below); or it needs a capability a subagent **provably** lacks. "The DB
is behind an MCP tool rather than `psql`" is *not* such a case — subagents reach the same MCP
tools, and the brief carries the ids. Quietly absorbing every suite into the main thread is how
an hour of evidence ends up in one context, which is the failure the fan-out exists to prevent.

The brief is the contract the subagents read. If the criteria above genuinely put everything in
the main thread, keep it short — a discovery record you cite in the report, not a full contract
written for nobody.

A suite that is a **pipeline** — trigger → wait (minutes) → verify the downstream effect
(an export landing in an observability backend, a queue consumer, a spawned job) — is
stateful and long-running: dispatch it as **one** subagent that owns the whole chain
(trigger, wait, verification), with the waiting in background polls. Never split the chain
into parallel fragments, and never let its waiting sit in the main context — long stateful
verification inline is how a run ends up compacting mid-flight.

**Every restart of the app under test opens a new environment generation.** Label them
(`gen-1`, `gen-2`, …) with what changed — env vars, a source edit, a config row — and keep each
generation's logs in its own file. Evidence does **not** cross the boundary: a log-line baseline,
a stub's hit count, an established session, a row written under the previous config all belong to
the generation that produced them. Fault suites restart the app by design (Mechanisms B and C), so
this is the common case, not an edge one; every evidence row cites its generation alongside the
stimulus window.

A background monitor is part of the evidence chain: its cap must exceed the watched
process's expected duration (from the brief's expensive-triggers row), it heartbeats each
poll to its log, and its final line states the outcome explicitly — `DONE <state>` vs
`TIMEOUT after <n>s`. A cap-exit that reads like completion sends the orchestrator chasing
phantom results; an empty log must mean a dead monitor, not a quiet one.

Before firing an **expensive trigger** (minutes of wall-clock, real tokens, real side
effects like a PR or an email), re-verify its preconditions from the brief **at fire time**,
not discovery time: restart-volatile state (a container-local binary, a warmed cache, a
linked integration) can vanish between the two — and a known gotcha from memory or a prior
run that kills the trigger is a wasted run, not a finding. At the same moment, establish
its **expected duration** from history (a previous run's rows or logs) into the brief's
expensive-triggers table: it sizes the monitors and wakeups, and it is the fact to cite
when the user proposes intervening in a run that only *looks* stuck — resetting a healthy
30-minute run at minute 24 pays for the same run twice.

After any consented mutation, compare the **actual blast radius** against what was cleared:
fan-out triggers (a retrigger that re-runs a whole pipeline, a job that spawns children)
can exceed the consented surface by orders of magnitude — read the trigger's implementation
*before* firing to know its fan-out. Exceeded anyway → report the delta immediately and
hold further mutations of that class until re-consented.

### 6. Fault-injection suite — solo, last

Run any `tester:fault` suite **alone, after** the read suites finish (it perturbs the
shared stack — pausing a dependency or fronting it with a proxy would corrupt parallel
suites). It picks the mechanism per fault kind
(`${CLAUDE_PLUGIN_ROOT}/references/FAULT_INJECTION.md`): **pause/stop the dependency** for
"dependency unavailable / fail-closed", a **WireMock proxy** for a specific HTTP response
shape (5xx body, timeout, malformed/empty). **Teardown is mandatory** — the dependency
must be restored and any proxy removed even if a check errors. After it returns,
**independently confirm** the stack is healthy again (don't trust the subagent's word).

Before skipping a fault check, read `${CLAUDE_PLUGIN_ROOT}/references/FAULT_INJECTION.md`
(*Scope / when to skip*) and walk the three rungs in order — each one down is a claim you must
have evidence for, never an assumption:

1. **A base-URL env exists** → Mechanism B **applies and must be attempted**. Its present value is
   irrelevant: an env pointing at a stage/HTTPS host still repoints. Neither a shared secret nor a
   2nd-party owner exempts it (WireMock terminates TLS; a catch-all proxy doesn't validate a static
   secret).
2. **No env, but the app constructs the dependency's client itself** → **Mechanism C**: the
   injection point can be *added* — an additive, default-preserving env read on the client's
   base-URL option, cleared through the capability question in step 4. "No `*_BASE_URL`" is the
   trigger for C, not a skip. It edits app source: log it in the teardown ledger, and revert any
   diagnostic edit made alongside it.
3. **Neither** → skip, with the concrete reason: a pure-infra fault beyond an HTTP proxy, or a real
   3rd-party whose base-URL is fixed or whose *per-request signatures* (not a static shared secret)
   break stub matching — then prefer mocking at the client boundary.

A skip reason names what was checked (`no base-URL env and no in-code client — checked <file>`),
never an assumed "probably can't". Same bar as a derivation gap (3b).

### 7. Triage + report

For each genuine `FAIL` (never `blocked`/`error`), read the check and its evidence and
classify:
- **impl-defect** — faithful check, behavior ≠ expected → code bug;
- **test-defect** — the check mis-projected the scope (wrong route/expected/stale
  assumption) → fix the check, not the code;
- **spec-defect** — faithful check, defensible impl, the conflict is rooted in an
  ambiguous/contradictory spec.

**Default under uncertainty = impl-defect**; the other two need concrete evidence.

Before triaging a subagent's finding, cross-check its cited evidence against the suite's
own stimulus window **and its environment generation**: a trace/row id or timestamp that
predates the suite's trigger (an earlier probe, a previous run), or a baseline taken before a
restart that changed the app's config, invalidates the row — re-verify directly, scoped to the
window and the current generation, before classifying.

A root cause is a **hypothesis**, not a finding. Reading the code and locating a plausible
mechanism makes it at most **PLAUSIBLE**; call it **CONFIRMED** only after a discriminating
experiment — a minimal repro, an isolation harness, a second telemetry source — whose
outcome the hypothesis predicts. Report the FAIL (the fact) separately from the root cause
(the hypothesis + its confidence); a confident wrong root cause poisons the fix downstream.

An anomaly noticed **while** diagnosing something else — a counter reading higher than the retry
budget allows, a loop that ran twice, a state that shouldn't exist — gets its own row classified
`observation`, with its evidence and an explicit "not investigated". A confirmed mechanism
explains what it was tested against, not everything sitting next to it; folding the odd number
into the neighbouring defect's narrative is how a second defect leaves the run undiscovered.

Report: a consolidated table per suite (pass/fail/blocked/skipped counts), every FAIL bound
to its AC/ref with the verdict and actual-vs-expected, the `observation` rows, the uncovered
gaps, the **teardown ledger** in full (what was changed, what was reverted, what deliberately stays and why) with
restoration verified against the step-2 snapshot and quoted, and one line of suggested next
action. Then **stop** — never auto-run a follow-up. The brief and `$WORK`
are ephemeral; mention the path but do not commit anything.

## Gate table

| Gate | Where | Type |
|---|---|---|
| Production-looking base-URL | step 2 | hard refuse |
| Scope unresolvable (no spec, empty diff, no code) | step 1 | block — ask the user to name a scope |
| No live stack reachable | step 2 | block affected suites |
| Persona login fails | step 2 | that persona's checks `blocked` (no cascade) |
| Mutation consent | step 4 | HIL (all / selected / none) |
| Check heading for `blocked` / a gap that a user action could unlock | step 4 | HIL — name the one concrete unlock (CLI on `PATH`, Mechanism C, a container, a credential) and ask; only a declined or out-of-reach unlock becomes a gap |
| New-user (invite/sign-up) scenario in scope | step 4 | HIL — ask for a disposable email; none given → those checks `blocked` |
| Fault dependency not swappable / not pausable | step 6 | walk the three rungs: env exists → Mechanism B (a stage/HTTPS value is still swappable); no env but an in-code client → Mechanism C (consented, additive); neither → skip with the checked reason, never assumed |
| Negative check ("X is absent") without proof the producer ran | step 5/6 | `ERROR "stimulus not fired"`, never FAIL — prove it via log marker / cache write / outbound call |
| Finding evidence outside the suite's stimulus window | step 5/7 | invalid row — re-verify directly, scoped to the window |
| Evidence carried across an app restart (baseline, hit count, session from an earlier generation) | step 5/6/7 | invalid — re-establish the baseline in the current generation before asserting |
| Mutation blast radius exceeds consent | step 5/6 | report the delta, hold that mutation class pending re-consent |
| Environment mutation not yet cleared (migration, source edit, restart under changed env, auth/config row, killing a process/backend) | any step | HIL — ask at that moment; once cleared, append to the teardown ledger before proceeding |
| Cookie expired mid-run | step 5/6 | `blocked` "cookie expired", never a FAIL |

## Not in scope of this command (use `mt` instead)

A persisted, versioned test corpus that reconciles with spec drift (hashed `deps`,
staleness, lock files, a DoR-gated plan) is `mt`'s job. `tester` is the "verify it now"
pass — it deliberately keeps no artifacts beyond the ephemeral brief.

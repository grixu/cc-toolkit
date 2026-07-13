# FAULT_INJECTION — causing errors to test their handling

Some behavior can only be verified by **making a dependency fail**: fail-closed authz,
atomic rollback after a side-effect error, timeout survival, cascade shutdown. You can't
observe these by calling the real service "normally" — you have to inject the failure. Two
mechanisms cover the practical range; pick per fault kind.

The fault suite runs **solo and last** (it perturbs the shared stack) and **always restores**
the dependency. A green check over a fault that never fired, or a stack left broken, is the
worst possible output.

## Mechanism A — pause/stop the dependency (default)

For **"the dependency is unavailable"**: the whole service is down / unreachable / times out,
and the app must fail safe. Fastest and most faithful — no proxy, no base-URL swap.

```bash
DEP=<container name from the brief>

# baseline (must currently succeed — proves recovery later)
curl -s -o /dev/null -w "baseline HTTP %{http_code}\n" -H "$A" <base>/<guarded-route>

# inject + PROVE active
docker pause "$DEP"                              # instant, reversible, no data loss
docker inspect -f '{{.State.Status}}' "$DEP"     # must print: paused

# assert the app's fail behavior (e.g. 500 fail-closed, 401 no-auth, 403 deny)
curl -s -o /dev/null -w "under-fault HTTP %{http_code}\n" -H "$A" <base>/<guarded-route>

# restore — ALWAYS, even on error
docker unpause "$DEP"
docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$DEP"
curl -s -o /dev/null -w "recovery HTTP %{http_code}\n" -H "$A" <base>/<guarded-route>
```

- `docker pause` freezes the process (connections hang → client sees timeout/refused) and is
  instantly reversible — prefer it. `docker stop` if you need the port actually closed;
  restart with `docker start`.
- Non-container process: stop it (note the exact restart command first) and restart after.
- **Prove `paused`/`exited` before asserting.** If you can't confirm the fault is active, the
  check is `ERROR "fault not injected"`, never `PASS`.

## Mechanism B — WireMock proxy (specific HTTP response shape)

For **"the dependency returns a specific bad response"**: a 5xx with a domain error body, a
response slower than the client timeout, a malformed/empty body, or "first call ok, then
fail". The app must reach the dependency through a **swappable base-URL** (2nd-party services
usually do; if it doesn't — confirmed by checking the config/env, not assumed — `skip` the
check with that reason).

```bash
# 1. ephemeral proxy
docker run -d --name tester-fault -p 8080:8080 wiremock/wiremock:latest

# 2. catch-all reverse-proxy to the real dependency (unstubbed traffic passes through;
#    WireMock terminates TLS to an HTTPS upstream)
curl -s -X POST localhost:8080/__admin/mappings -d '{
  "priority": 10, "request": {"urlPattern": ".*"},
  "response": {"proxyBaseUrl": "<https://real.dependency>"}}'

# 3. point the app's dependency env at the proxy — this only works if set BEFORE the app
#    started reading it; on a stack already running against the real URL, prefer Mechanism A
#    or (re)start the relevant service with <DEP_BASE_URL>=http://localhost:8080

# 4. stub the error shape at higher priority on the real route
curl -s -X POST localhost:8080/__admin/mappings -d '{
  "priority": 1,
  "request":  {"method": "POST", "urlPath": "<route>"},
  "response": {"status": 503, "jsonBody": {"error": "<domain_error>"}}}'
#   fault variants: "response": {"fault": "CONNECTION_RESET_BY_PEER"}   # | MALFORMED_RESPONSE_CHUNK | EMPTY_RESPONSE
#   timeout:        "response": {"status": 200, "fixedDelayMilliseconds": 30000}  # > client timeout

# 5. replay the app action → PROVE the stub matched
curl -s localhost:8080/__admin/requests | <check the stubbed route was hit>

# 6. teardown — ALWAYS
curl -s -X POST localhost:8080/__admin/reset
docker rm -f tester-fault
#   + restore the dependency base-URL / restart the service you redirected
```

### Two traps (this is where fault-injection actually fails)

- **Non-deterministic payloads** — requests carry tokens/timestamps/nonces, so a strict stub
  may **not match** and the fault silently doesn't fire (false green). Match loosely
  (method + path only), and **verify in the journal** (`/__admin/requests`) that the stub was
  hit. No match → `ERROR "fault not injected"`, never `PASS`.
- **Stateful sequences** — rollback is often `create → commit`: the first call must pass, only
  a later one faults. Use WireMock **scenarios** (stateful mappings) for "first call ok, then
  fail". A stack pointed at the proxy from a clean start avoids the "old base-URL still pooled"
  problem.

## Scope / when to skip

- **2nd-party with a configurable base-URL** (your own other services) → both mechanisms work;
  proxy gives you exact response shapes.
- **3rd-party behind TLS + signatures** (vendors) → intercepting is brittle; prefer mocking at
  the app's client boundary or `skip` with the reason.
- **Infrastructure faults** (Redis restart, sidecar kill, DB cut, pure-TCP faults) → beyond an
  HTTP proxy. Mechanism A (pause/stop that container) covers the "it's down" case; anything
  finer is a gap, not a check — say so.

## The one invariant

**Restore the dependency and confirm recovery, always.** Structure the suite so teardown runs
even if an assertion throws. After the suite, the orchestrator independently re-checks the
stack is healthy — don't rely on the subagent's word alone.

# BRIEF_TEMPLATE — the shared environment brief

`/tester:run` fills this in at step 2 and writes it to `$WORK/BRIEF.md`. It is the **only**
artifact of a run and the **single shared contract** every suite subagent reads. It must be
self-sufficient: a subagent that reads only the brief can run its suite without re-deriving
anything. Everything below is discovered **fresh** each run — never copied from stale config.

Keep it tight. Delete sections that don't apply. Fill every `<…>`.

---

```markdown
# <feature/scope> — runtime verification brief

You are verifying <scope> on a LOCAL/STAGING running stack (branch `<branch>`, repo
`<path>`). Source of truth for expected behavior: <spec path | the diff | code contracts>.

## Base URLs & quirks (already established — do not re-derive)
- API base: `<http://localhost:PORT>` — <prefix or NO prefix; note the real one>.
- Response envelope: `<{"success":true,"data":…} | raw | none>` — unwrap `<.data>`.
- The "current user" endpoint is `<GET /user>` (correct any assumption like `/me`).
- Auth: session cookie `<name>` (`<kind, e.g. httpOnly JWT>`) — send the full cookie header.
- UI base (if any): `<http://localhost:PORT>`.

## Personas & cookie files
Cookie header = one line, ready for `curl -H "Cookie: $(cat FILE)"`. Files live in `$WORK`.
| Persona | Login/email | id | Expected roles/perms | Cookie header file |
|---|---|---|---|---|
| <name> | <email> | <id> | <roles> | `<name>.cookieheader.txt` |

For UI login the plaintext password is in `$WORK/<persona>.pass` (generated for this run,
UI-login only — read into a shell var, never echoed into a table, note, or filename).

## Pre-state snapshot (taken before the first mutation — the restore target)
- Rows: `<per-status counts, e.g. COMPLETED:15>`; singleton/state rows: `<table: present/absent>`.
- Processes/ports up at start: `<…>` (so you know what you started and must stop).
- User-owned stores the app writes to: `<vault path / bucket / mailbox>` — contents at start
  `<count or listing method>`, and how to enumerate what *this run* created
  `<the DB column / API field / log line that records each artifact's exact name>`.

## Domain topology (what exists to test against)
- <entities, ids, ownership, relationships the checks rely on — e.g. orgs 1420/1483, who owns what>

## curl pattern
```bash
WORK=<the run's work dir>
A="Cookie: $(cat $WORK/<persona>.cookieheader.txt)"
curl -s -o /tmp/body -w "HTTP %{http_code}\n" -H "$A" <base>/<route>; cat /tmp/body
```
Cookies may expire mid-run (JWT ~1h). A 401 where 200/403 is expected → report
"cookie expired", never a false FAIL.

## agent-browser pattern (UI suites)
`agent-browser <version>` on PATH. Drive the browser **only** through this CLI; every verdict
comes from an assertion command with `--json` (`is visible`, `get text`, `get url`, `get count`,
`eval`), never from eyeballing a snapshot. Screenshot failing checks into `$WORK/`.

⚠️ **Session isolation is mandatory** — UI suites run in parallel. Each suite exports
`AGENT_BROWSER_SESSION=<suite id>` (e.g. `s3s4`) as its first command and closes only its own
session at the end — **never** `agent-browser close --all`.
```bash
PW="$(cat "$WORK/<persona>.pass")"          # read into a var; never echo it
agent-browser open <ui-base>/login
agent-browser fill '[type=email]' '<email>'
agent-browser fill '[type=password]' "$PW"
# submit, then assert you land on an authenticated route
```
Stable UI hooks on the surface under test (prefer them over raw CSS):
`<data-testid list, e.g. share-card / share-success / share-error — or "none, use role/label">`.

## DB access (read-only SELECTs unless the safety rules clear a seed)
Whichever of these the stack actually offers — a subagent has the same MCP tools as the main
thread, so a DB reachable only through MCP is **not** a reason to skip the fan-out.
```bash
# shell client
<e.g. docker exec -e PGPASSWORD=… <pg-container> psql -U … -d … -c "SQL">
```
```
# or MCP: tool <mcp__…__run_sql>, projectId=<…>, branchId=<… — the non-prod branch
# verified in step 2>. Pass these exact ids; never re-resolve them yourself.
```

## Dependency / fault surface (for the fault suite)
- Dependency: container/process `<name>`, image `<…>`.
- App reaches it at `<addr>`; host-published at `<addr>` (if any).
- Swappable base-URL env: `<ENV_NAME | none — only pause/stop is possible>`.
- Supervision: `<how the stack runs and what one container's exit does — e.g. run.sh =
  docker compose up --abort-on-container-exit → any single exit tears down the whole stack;
  prefer pause over stop/restart>`.

## Environment generations (one row per restart of the app under test)
| gen | started | config delta vs previous | log file |
|---|---|---|---|
| gen-1 | <ts> | <baseline — as discovered> | `<$WORK/app-gen1.log>` |

## Expensive triggers & their preconditions
| Trigger | Cost / side effects | Expected duration (source) | Verify RIGHT BEFORE firing |
|---|---|---|---|
| <e.g. POST /ai-agent/…/runs> | <real LLM tokens, opens a real draft PR> | <~30 min — last SUCCEEDED row in `agent_run`> | <binary X present in worker; integration linked; no active run> |

## Expected-behavior model (what SHOULD happen — the assertion oracle)
- <deny-by-default? → 403>; <no auth → 401>; <dependency down → 500 / fail-closed>.
- <per-role / per-route matrix: who is allowed what; which routes are global vs scoped>.
- <enumerated error paths from the spec's critical-errors / edge-case sections>.
- <consequence chains: an action that grants/revokes capability, then the change it causes —
  e.g. accept invite (status → active) → role assigned → a formerly-403 read now 200. Assert the
  downstream effect, not just the action's 2xx.>
- Stimulus proof for negative checks: <how to prove the producer actually ran — log marker,
  cache write, outbound call>. Caches/async layers that can swallow a trigger:
  <e.g. redis suggestion cache `new_audits:*` — clear/bust before checks asserting on the
  effect | none>.

## Safety rules (non-negotiable)
- NEVER perform an ALLOW mutation over HTTP/UI unless explicitly cleared below — it really
  mutates. Test the matrix WITHOUT side effects:
  1. use a non-mutating probe (`<can/dry-run route>`) for the ALLOW side if one exists;
  2. exercise the real guard only with SAFE GETs (expect 200/403) and mutations you expect
     DENIED (403 fires before any change).
- Mutation consent cleared this run: `<none | all | the specific endpoints>`.
- Environment mutations cleared this run: `<none | migration X, seeding rows in <table>, restart
  under <env>, injection point in <file>>`. Anything not listed here needs a fresh ask. Every one
  performed is appended to the teardown ledger `<$WORK/TEARDOWN.md>` at the moment it happens.
- New-user flows (invite-new-user / sign-up) use the disposable email the user provided this
  run: `<address | none — new-user checks blocked>`. Never invent an address — real mail may be
  sent and the registration lands in a possibly-shared IdP.
- Credentials/tokens stay in `$WORK` and env — never echoed into a returned table.

## Known issues already found (verify precisely if in your suite, don't blindly re-confirm)
- <🔴 endpoint X returns 500 because …>  (or "none yet")

## Return format (STRICT)
Return ONLY a compact markdown table — one row per check —
`| AC/ref | check | expected | actual | PASS/FAIL |` — then `NOTES:` up to 5 bullets.
No curl bodies, no logs. Use BLOCKED/ERROR (not FAIL) when a check could not run.
```

---

## Why each section earns its place

- **Base URLs & quirks** — the single most common cause of false FAILs is a wrong assumed
  route/prefix/envelope. Pin the real ones once, here.
- **Personas & cookie files** — auth is stateful; establish it once in the main thread and
  hand subagents ready-to-use cookie headers, so five suites don't each re-login.
- **agent-browser pattern** — the UI equivalent of the curl pattern: pin the login flow, the
  `--json`-assertion discipline, and the stable `data-testid` hooks once, here, so parallel UI
  suites don't each rediscover them. The session-isolation line is load-bearing — without a
  distinct `AGENT_BROWSER_SESSION` per suite, two UI suites share one browser and corrupt each
  other's state (and a stray `close --all` kills a sibling mid-run).
- **Environment generations** — a restart under changed env or after a source edit produces a
  different app; evidence gathered against the previous one silently stops meaning what it meant.
  Numbering the generations and keeping a log file per generation is what lets a later assertion
  ("the stub was never hit during the re-drive") rest on a baseline taken under the same config.
- **Expensive triggers & preconditions** — a trigger that costs minutes, real tokens, or real
  side effects deserves a pre-flight: its preconditions are re-verified at fire time, not
  discovery time, because restart-volatile state (a container-local binary, a warmed cache, a
  linked integration) can vanish between the two. A known gotcha that kills the trigger is a
  wasted run, not a finding. The expected duration comes from history (a previous run's rows
  or logs), never a guess — it sizes the monitors and is the answer when a healthy long run
  starts to look stuck.
- **Expected-behavior model** — without an oracle, a subagent can only report what happened,
  not whether it was *right*. This section is what turns observation into a verdict. Include
  **consequence chains**, not just single-endpoint cells: a permission model exists so one
  action changes what the principal may do next — a check that stops at the action's 2xx misses
  the behavior the model is *for*.
- **Pre-state snapshot** — "restored" is a comparison, not a feeling. Without a baseline captured
  before the first write, a state row the app itself created during the run is indistinguishable
  from one that was always there, and cleanup either leaves litter or deletes something real. It
  also pins how to enumerate this run's artifacts by exact name — the only safe way to remove
  them from a store the user owns.
- **Safety rules** — the difference between a verification pass and an accidental data-mutation
  spree. The default is read-only + expected-denial; real mutations are opt-in, in both classes:
  the feature's own and the environment's.
- **Known issues** — prevents a re-run from "discovering" a bug you already filed, and lets a
  post-fix run confirm precisely.

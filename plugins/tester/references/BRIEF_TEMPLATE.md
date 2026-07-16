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

## DB access (read-only SELECTs; disposable local dev)
```bash
<e.g. docker exec -e PGPASSWORD=… <pg-container> psql -U … -d … -c "SQL">
```

## Dependency / fault surface (for the fault suite)
- Dependency: container/process `<name>`, image `<…>`.
- App reaches it at `<addr>`; host-published at `<addr>` (if any).
- Swappable base-URL env: `<ENV_NAME | none — only pause/stop is possible>`.

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
- **Expected-behavior model** — without an oracle, a subagent can only report what happened,
  not whether it was *right*. This section is what turns observation into a verdict. Include
  **consequence chains**, not just single-endpoint cells: a permission model exists so one
  action changes what the principal may do next — a check that stops at the action's 2xx misses
  the behavior the model is *for*.
- **Safety rules** — the difference between a verification pass and an accidental data-mutation
  spree. The default is read-only + expected-denial; real mutations are opt-in.
- **Known issues** — prevents a re-run from "discovering" a bug you already filed, and lets a
  post-fix run confirm precisely.

---
title: Reference
description: The argument, the requirements, the verdicts and defect classes in a report, and the files a run writes.
group: reference
sidebar:
  order: 4
---

## Command

```
/tester:run [<spec-path-or-url> | free-text scope]
```

| Argument | tester checks |
|---|---|
| a spec path or URL | the spec's acceptance criteria, its error and edge-case sections, and any API, database or config contracts it states |
| free text, such as `"the org-role assignment endpoints"` | the code behind that area and any nearby spec |
| nothing | the `git diff` against the merge base with the main branch, plus any spec the diff references |

Table 1. What each form of the argument scopes.

tester has no flags and no configuration.
You start it yourself; Claude doesn't run it on its own.

## Requirements

| Needed | For | Without it |
|---|---|---|
| a local or staging stack | every check | a down stack can be started after you agree; a production-looking base URL halts the run |
| `curl` and `git` | API checks and the diff scope | — |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | UI checks and logging test users in | UI checks are `BLOCKED`, with the reason stated |
| Docker | fault checks that pause a container or add a WireMock proxy | those fault checks are `SKIP`, with the reason stated |
| a database client, such as `psql`, or a database MCP tool (optional) | checks that read database rows; queries are read-only | checks that need the database are `BLOCKED` |

Table 2. What a run needs, and what happens when a piece is missing.

## Questions before a run

| Question | Answers | Default |
|---|---|---|
| Which suites to run | all, or a subset | — |
| May checks make real changes through the app | `all`, `selected` or `none` | `none`: only reads and attempts the app is expected to deny |
| Which environment changes are allowed | for example starting services, seeding rows, applying a migration, restarting with different settings, adding an injection point | none until you allow them |
| What could you supply to unlock a blocked check | for example a credential, a CLI on `PATH`, a container, a disposable email address | — |

Table 3. The one round of questions `/tester:run` asks before any check runs.

## Verdicts

| Verdict | Means |
|---|---|
| `PASS` | the recorded command output matches the expected behavior |
| `FAIL` | the recorded command output differs from the expected behavior |
| `BLOCKED` | a precondition is missing, such as an expired session, a declined change or an unavailable capability |
| `ERROR` | the check itself broke, the action it observes never fired (`ERROR "stimulus not fired"`), or the injected fault couldn't be proven active (`ERROR "fault not injected"`) |
| `SKIP` | the check didn't run, with the reason stated |

Table 4. The verdict of a single check.

## Defect classes

Every `FAIL` gets one class:

| Class | Means | You fix |
|---|---|---|
| implementation defect | the check is faithful and the app doesn't behave as expected | the code |
| test defect | the check got the scope wrong, such as a wrong route or a stale assumption | nothing in the app |
| spec defect | the check is faithful and the code defensible; the spec is ambiguous or contradicts itself | the spec |

Table 5. How tester classifies a failure. When it's unsure, it picks implementation defect.

An anomaly found while diagnosing another failure gets its own `observation` row, marked as not investigated.
A root cause is `PLAUSIBLE` until an experiment confirms it, and then `CONFIRMED`.

## Files a run writes

| File | Holds |
|---|---|
| `$TMPDIR/tester.XXXXXX/` | the run's temporary directory; the report gives its path |
| `BRIEF.md` | everything the suites need: base URLs, test users, starting snapshot, patterns, dependencies, expected behavior, safety rules |
| `TEARDOWN.md` | the teardown ledger: each environment change, how to revert it, and whether it was reverted |
| session files and screenshots | test users' sessions and screenshots of failing UI checks |

Table 6. Everything a run leaves, all inside the temporary directory.

Nothing is written into your repository, except an injection point you approved or a change you chose to keep.
Both appear in the ledger.

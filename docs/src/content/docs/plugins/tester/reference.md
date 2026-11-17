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
/tester:run --rerun [<run id>]
```

| Argument | tester checks |
|---|---|
| a spec path or URL | the spec's acceptance criteria, its error and edge-case sections, and any API, database or config contracts it states |
| free text, such as `"the org-role assignment endpoints"` | the code behind that area and any nearby spec |
| nothing | the `git diff` against the merge base with the main branch, plus any spec the diff references |
| `--rerun` | the `FAIL`, `BLOCKED` and `ERROR` rows of the current worktree's last finished run, with the commands that run recorded |
| `--rerun <run id>` | the same rows of the named run; the report gives each run's id |

Table 1. What each form of the argument scopes.

`--rerun` takes no scope text beside it.
You start tester yourself; Claude doesn't run it on its own.

## Settings

Set them in `/plugin` → tester → configure.

| Setting | Default | Means |
|---|---|---|
| `run_retention` | `50` | how many runs to keep per repository, all its worktrees counted together |
| `explore` | `true` | run the exploratory suite; turn it off for shorter runs that check only what the spec states |

Table 2. The plugin's settings.

The plugin's mod hands the settings to the command.
Without the mod, a run uses the defaults, works in a temporary directory and can't be repeated with `--rerun`.

## Requirements

| Needed | For | Without it |
|---|---|---|
| a local or staging stack | every check | a down stack can be started after you agree; a production-looking base URL halts the run |
| `curl` and `git` | API checks and the diff scope | — |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | UI checks and logging test users in | UI checks are `BLOCKED`, with the reason stated |
| Docker | fault checks that pause a container or add a WireMock proxy | those fault checks are `SKIP`, with the reason stated |
| a database client, such as `psql`, or a database MCP tool (optional) | checks that read database rows; queries are read-only | checks that need the database are `BLOCKED` |

Table 3. What a run needs, and what happens when a piece is missing.

## Questions before a run

| Question | Answers | Default |
|---|---|---|
| Which suites to run | all, or a subset, the exploratory suite included | — |
| May checks make real changes through the app | `all`, `selected` or `none` | `none`: only reads and attempts the app is expected to deny |
| Which environment changes are allowed | for example starting services, seeding rows, applying a migration, restarting with different settings, adding an injection point | none until you allow them |
| What could you supply to unlock a blocked check | for example a credential, a CLI on `PATH`, a container, a disposable email address | — |

Table 4. The one round of questions `/tester:run` asks before any check runs. A rerun asks it again.

## Verdicts

| Verdict | Means |
|---|---|
| `PASS` | the recorded command output matches the expected behavior |
| `FAIL` | the recorded command output differs from the expected behavior |
| `BLOCKED` | a precondition is missing, such as an expired session, a declined change, an unavailable capability, or a readiness probe that failed (`BLOCKED "doctor: <probe>"`) |
| `ERROR` | the check itself broke, the action it observes never fired (`ERROR "stimulus not fired"`), the injected fault couldn't be proven active (`ERROR "fault not injected"`), or on a rerun the route or page it targets is gone (`ERROR "check stale — run fresh"`) |
| `SKIP` | the check didn't run, with the reason stated |

Table 5. The verdict of a single check.

## Defect classes

Every `FAIL` gets one class:

| Class | Means | You fix |
|---|---|---|
| implementation defect | the check is faithful and the app doesn't behave as expected | the code |
| test defect | the check got the scope wrong, such as a wrong route or a stale assumption | nothing in the app |
| spec defect | the check is faithful and the code defensible; the spec is ambiguous or contradicts itself | the spec |

Table 6. How tester classifies a failure. When it's unsure, it picks implementation defect.

An anomaly found while diagnosing another failure gets its own `observation` row, marked as not investigated.
An exploratory lead becomes a `FAIL` only when an API or UI check reproduces it; one no check reproduces is an `observation`, not reproduced.
A reproduced finding the spec says nothing about is a spec defect.
A root cause is `PLAUSIBLE` until an experiment confirms it, and then `CONFIRMED`.

## Files a run writes

| File | Holds |
|---|---|
| `~/.cache/tester/<repository>/<run id>/` | the run's directory, shared by every worktree of the repository and under `$XDG_CACHE_HOME` when that is set; the report gives its path |
| `BRIEF.md` | everything the suites need: base URLs, test users, starting snapshot, patterns, dependencies, expected behavior, readiness probes, safety rules |
| `SUITES.md` | the checks as derived, which a rerun repeats |
| `evidence/` | the command and output behind every row, one file per suite |
| `TEARDOWN.md` | the teardown ledger: each environment change, how to revert it, and whether it was reverted |
| `secrets/` | test users' sessions and generated passwords; deleted when the run ends |
| screenshots | screenshots of failing UI checks |

Table 7. Everything a run leaves, all inside its directory.

The oldest runs beyond `run_retention` are deleted when a run starts; an unfinished run started in the last 24 hours is kept.
Nothing is written into your repository, except an injection point you approved or a change you chose to keep.
Both appear in the ledger.

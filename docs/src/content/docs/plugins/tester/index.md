---
title: tester
description: Checks that a running app behaves as intended, through its API, its UI, and simulated dependency failures, with evidence for every verdict.
---

Unit tests pass, but nobody has checked that the change works in the running app. tester runs that check against your local or staging stack. It reports what passed and failed, with a recorded command behind every verdict.

It keeps no configuration and saves no test plan. Each run discovers the environment from scratch and leaves a report.

## Install

```
/plugin install tester@cc-toolkit
```

tester needs a running, non-production app. [agent-browser](https://github.com/vercel-labs/agent-browser) is optional and enables UI checks. Docker is needed for the fault checks that pause a container or add a WireMock proxy.

## What it does

| Command or skill | What it does |
|---|---|
| `/tester:run` | Finds the live stack, derives checks from a spec, a named area, or your git diff, and runs them. Returns a `PASS`/`FAIL` table per suite with evidence. |
| `tester:api` agent | Runs one suite of API checks with `curl`, plus read-only database queries where a check needs them. |
| `tester:ui` agent | Runs one suite of browser checks through `agent-browser`. |
| `tester:fault` agent | Runs the error-handling suite alone and last, by making a dependency fail and checking the app's response. |

You start `/tester:run` yourself; Claude doesn't run it on its own. The three agents are internal: `/tester:run` dispatches them, one per suite.

Before anything runs, tester asks one round of questions. You pick the suites, whether checks may make real changes through the app, and which environment changes are allowed. The default for real changes is `none`, which runs only reads and attempts expected to be denied.

## Usage

- Check a spec's acceptance criteria:

  ```
  /tester:run docs/specs/team-invites.md
  ```

- Check a named area of the app:

  ```
  /tester:run "the org-role assignment endpoints"
  ```

- Check what changed since the main branch:

  ```
  /tester:run
  ```

Every `FAIL` in the report ties to its acceptance criterion and is classified as an implementation, test, or spec defect. The report also lists every change made to your environment and how it was reverted.

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/tester/README.md) has the safety rules and the fault-injection details.

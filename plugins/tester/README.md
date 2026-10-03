# tester

Unit tests pass, but nobody has checked that the change works in the running app. tester does
that check: give it a spec, a feature area, or nothing (it then uses your git diff), and it works
out what to test, runs the checks through the API, the browser and simulated dependency failures,
and reports what passed and failed with a recorded command behind every verdict.

It keeps no configuration and saves no test plan. Each run discovers the environment from scratch
and leaves only a report.

## Requirements

- A local or staging stack. tester stops if a base URL looks like production. If the stack is
  down, tester can start it after you agree.
- `curl` and `git`.
- [agent-browser](https://github.com/vercel-labs/agent-browser), for UI checks and for logging
  test users in. Without it, UI checks are skipped with the reason stated.
- Docker, for fault checks that pause a dependency's container or put a WireMock proxy in front
  of it.
- Optional: a database client (for example `psql`) or a database MCP tool, for checks that read
  database rows. These queries are read-only.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install tester@cc-toolkit
```

## Usage

You start tester yourself; Claude does not run it on its own.

```
/tester:run docs/specs/team-invites.md          # check a spec's acceptance criteria
/tester:run "the org-role assignment endpoints"  # check a named area of the app
/tester:run                                      # check what changed since the main branch
```

## What a run does

1. Scope. It reads the spec's acceptance criteria, the code behind a named area, or the
   `git diff` against the merge base with the main branch.
2. Discovery. It finds the live ports, the real routes, the test users and their roles, database
   access, and the dependencies it can make fail. It records a snapshot of the current state and
   writes everything into a brief that every check reads.
3. Checks. It turns each expected behavior into concrete checks: API (curl), UI (browser) and
   error handling (fault injection).
4. One round of questions before anything runs:
   - which suites to run;
   - whether checks may make real changes through the app (`all`, `selected` or `none`; the
     default is `none`, which runs only reads and attempts that are expected to be denied);
   - which environment changes are allowed, such as starting services, seeding rows or applying
     a migration;
   - anything you could supply to unlock a check that would otherwise be blocked, such as a
     credential, a CLI on `PATH`, or a disposable email address for sign-up flows.
5. Execution. API and UI suites run in parallel, one subagent per suite. The fault suite runs
   alone and last. Afterwards tester confirms the stack is healthy.
6. Report.

## What you get

A report in the conversation:

- a result table per suite, with each check marked `PASS`, `FAIL`, `BLOCKED`, `ERROR` or `SKIP`;
- every `FAIL` tied to its acceptance criterion, with expected and actual output, and classified
  as an implementation defect, a test defect or a spec defect;
- unrelated anomalies noticed along the way, marked as not investigated;
- behaviors it could not check, each with the reason;
- the teardown ledger: every change made to your environment, how it was reverted, and anything
  left in place on purpose;
- one suggested next step.

The brief, session cookies, ledger and screenshots live in a temporary directory
(`$TMPDIR/tester.XXXXXX`) whose path the report gives. Nothing is written to your repository.

## Safety rules

- It refuses production-looking base URLs.
- It makes real changes through the app only on the surface you approved.
- It logs every environment change, reverts it, and checks the result against the starting
  snapshot.
- It deletes data it created in your stores by the exact recorded name, never by pattern.
- It reports problems and does not fix your code. The one exception: with your approval, it adds
  an injection point so a dependency can be made to fail.

## Fault injection

tester can make a dependency fail in three ways, in this order of preference:

1. Pause or stop the dependency's container, to test "the dependency is down".
2. Point the app's base-URL setting for the dependency at a temporary WireMock proxy that returns
   a chosen 5xx, a timeout or a malformed response.
3. With your approval, when the app has no base-URL setting for that dependency, add a small,
   reversible injection point in the source.

The dependency is always restored and the proxy removed, even when a check errors.

## Internals

`/tester:run` uses these parts; you do not invoke them directly.

- Agents `tester:api` and `tester:ui` run on `sonnet` to save cost. `tester:fault` uses your
  session model, because it is the one agent that disrupts the shared stack.
- `references/BRIEF_TEMPLATE.md` is the skeleton of the brief.
- `references/FAULT_INJECTION.md` describes the three fault mechanisms and their traps.
- `evals/` is the maintainer's promptfoo test suite, run against a fixture app with planted
  defects. It is developer tooling, needs Docker, and is described in `evals/README.md`.

tester is the lightweight counterpart to `mt`, an unpublished plugin that maintains a persistent,
re-runnable test suite.

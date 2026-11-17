# tester

Unit tests pass, but nobody has checked that the change works in the running app. tester does
that check: give it a spec, a feature area, or nothing (it then uses your git diff), and it works
out what to test, runs the checks through the API, the browser and simulated dependency failures,
and reports what passed and failed with a recorded command behind every verdict.

It saves no test plan to maintain. Each run discovers the environment from scratch, leaves a
report, and keeps its checks outside your repository, so that after a fix you can repeat exactly
the checks that failed. It changes your source only with your approval (see Fault injection).

## Requirements

- A local or staging stack. tester stops if a base URL looks like production. If the stack is
  down, tester can start it after you agree.
- `curl` and `git`.
- [agent-browser](https://github.com/vercel-labs/agent-browser), for UI checks and for logging
  test users in. Without it, tester records the gap and marks the UI checks `BLOCKED`,
  unless you install it when tester asks.
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
/tester:run --rerun                              # repeat the failed checks of this worktree's last run
/tester:run --rerun 20261117T092450Z-spec-md     # repeat those of a named run
```

## What a run does

1. Scope. It reads the spec's acceptance criteria, the code behind a named area, or the
   `git diff` against the merge base with the main branch.
2. Discovery. It finds the live ports, the real routes, the test users and their roles, database
   access, and the dependencies it can make fail. It records a snapshot of the current state and
   writes everything into a brief that every check reads.
3. Readiness check. A few read-only probes confirm the app answers, each test user's session
   works, the pages the UI checks start from load, and the dependencies to be failed are up. A
   failed probe becomes a question or a blocked suite, never a failed check. The probes run again
   just before the checks start and after every app restart.
4. Checks. It turns each expected behavior into concrete checks: API (curl), UI (browser) and
   error handling (fault injection). With exploration on, it also writes a few charters for an
   exploratory suite: short sessions that try what the spec never mentions, such as malformed
   input, a double submit or a stale session.
5. One round of questions before anything runs:
   - which suites to run;
   - whether checks may make real changes through the app (`all`, `selected` or `none`; the
     default is `none`, which runs only reads and attempts that are expected to be denied);
   - which environment changes are allowed, such as starting services, seeding rows or applying
     a migration;
   - anything you could supply to unlock a check that would otherwise be blocked, such as a
     credential, a CLI on `PATH`, or a disposable email address for sign-up flows.
6. Execution. API and UI suites run in parallel, one subagent per suite. The exploratory suite
   runs after them and returns leads, not verdicts: each lead becomes a check that an API or UI
   subagent runs, and only a lead that check reproduces counts as a failure. The fault suite runs
   alone and last. Afterwards tester confirms the stack is healthy.
7. Report.

## What you get

A report in the conversation:

- a result table per suite, with each check marked `PASS`, `FAIL`, `BLOCKED`, `ERROR` or `SKIP`;
- every `FAIL` tied to its acceptance criterion, with expected and actual output, and classified
  as an implementation defect, a test defect or a spec defect;
- exploratory findings a check reproduced; a defect the spec says nothing about is classified as
  a spec defect, a question for whoever owns the spec;
- unrelated anomalies noticed along the way, and exploratory leads no check reproduced, marked
  as not investigated;
- behaviors it could not check, each with the reason;
- the teardown ledger: every change made to your environment, how it was reverted, and anything
  left in place on purpose;
- one suggested next step, and the `--rerun` line when anything failed.

Your repository changes only when you approve an injection point, or keep a change in place on
purpose, and the ledger lists either.

## Kept runs and `--rerun`

Each run gets a directory in `~/.cache/tester/<repository>/` (under `$XDG_CACHE_HOME` when that
is set), outside your repository. Every worktree of one repository shares that store. The
directory holds the brief, the checks as derived (`SUITES.md`), the command and output behind
every row (`evidence/`), the results and the teardown ledger. Session cookies and generated
passwords sit in its `secrets/` folder, which is deleted when the run ends; the next run also
deletes any left by a run that crashed.

`/tester:run --rerun` repeats the `FAIL`, `BLOCKED` and `ERROR` rows of the current worktree's
last finished run, with the commands that run recorded rather than newly derived checks, so the
before and after compare like with like. Discovery, the readiness check and the question round
run again, because sessions and consent never carry over. The report shows what was fixed, what
still fails and what changed. Rows that passed before are not repeated, so a regression among
them would not show: run fresh for that. A check whose route or page no longer exists is reported
as stale, never as a failure.

The oldest runs beyond the retention limit are deleted at the start of each run. A run started
in the last 24 hours that has not finished is never deleted, since another worktree may still
be using it.

## Settings

Set them in `/plugin` → tester → configure. The plugin's mod hands them to the command through
its `runs` tool.

| Setting | Default | Meaning |
|---|---|---|
| `run_retention` | `50` | How many runs to keep per repository, all its worktrees counted together. |
| `explore` | `true` | Run the exploratory suite. Turn it off for shorter runs that check only what the spec states. |

Without the mod (mods turned off, or the tool fails), a run works in a temporary directory, uses
the default settings, and cannot be repeated with `--rerun`.

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
  session model, because it is the one agent that disrupts the shared stack, and so does
  `tester:explore`, because its charters ask for judgment rather than a fixed list of checks.
- The mod in `hooks/` provides the `runs` tool: it opens the run directory, prunes old runs and
  finds the run a `--rerun` repeats.
- `references/BRIEF_TEMPLATE.md` is the skeleton of the brief.
- `references/FAULT_INJECTION.md` describes the three fault mechanisms and their traps.
- `evals/` is the maintainer's promptfoo test suite, run against a fixture app with planted
  defects. It is developer tooling, needs Docker, and is described in `evals/README.md`.

tester is the lightweight counterpart to `mt`, an unpublished plugin that maintains a persistent,
re-runnable test suite. tester's kept runs are a record for `--rerun`, pruned by age; nothing keeps
them in step with the spec.

# Codex joins a review as an external reader, not as a lens

Status: accepted

A review can add OpenAI Codex, run through the collegium plugin, as a second reader beside the
Claude lenses. It reaches the merge the way a lens does, as a `codex` entry in `scope.json`'s
`lenses.active` and a `codex.md` in the context directory, but it is an **external review**: a
user setting and the presence of a tool gate it, never the input, and it is counted apart from
the lenses. code-review declares no dependency on collegium; it looks for Collegium's tools at run
time.

**When it runs.** Whenever the Collegium tools are available and Codex is enabled inside
Collegium, the userConfig option `collegium_run` decides: `always`, `never` or `ask`. `ask` is the
default, and an option never saved reaches the skill as the literal `${user_config.collegium_run}`,
which reads as `ask` too. Under `ask`, `/start-cr` asks once per review, and only when the tools
are present. Under `always` with the tools absent, the Codex review is still entered and ends as a
skip with its reason, so a user who asked for Codex every time sees why it did not run. Whether
Codex is enabled is Collegium's to answer when it is called.

**What Codex is given and returns.** Codex gets the same context directory the lenses read
(scope, conventions, standards), the diff command, and `references/severity.md` as the family and
rule table, and answers in the strict schema `{family, rule, severity, path, lines, loss, fix}`.
The scanner renders that answer into `codex.md` in the scanner-contract format: an item whose
family and rule are a row of the table becomes a finding with that row's severity; every other
item goes to `CANDIDATES`, where the merge decides it. Codex runs read-only, in the checkout under
review, which is the pull request's worktree under `--pr`.

**One path for both routes.** `/start-cr` Step 2b and `cr-prepare --codex` each write the `codex`
entry, and a `code-review:scanner` agent running `cr-scan --lens codex` calls `collegium_run`,
waits on `collegium_result`, and writes `codex.md`. `cr-prepare` cannot wait for anything, and one
renderer keeps the two routes' `codex.md` identical. A caller that runs every other lens in one
agent, as fd3 does, must still dispatch the `codex` lens as its own agent, so a long Codex run
never holds up the lenses listed with it.

**Timing and failure.** The Codex run starts together with the Claude scanners, and the merge
waits for it, up to the 60-minute run limit. A run that fails, times out, is skipped or finds the
tools absent still writes `codex.md`, with the header `Lens: codex · skipped: <reason>`; a
`codex.md` that is missing or headerless, because its scanner died, reads as `no output`. The merge
turns both into `skipped: codex — <reason>` in the Tally. Neither is an undelivered lens:
`/start-cr`'s fail-closed menu never opens for Codex, and `cr-merge` never returns `incomplete`
for it.

**Counting.** A Codex finding that lands on the same code as a Claude lens finding counts as
independent convergence, the strongest signal the merge has. Codex is not counted among the
lenses: `Lenses: L of A` and the hard-coded lens counts stay as they are, and a delivered run adds
`External review: codex` to the Tally instead.

## Considered Options

- **Make Codex a thirteenth lens** — rejected: a lens is gated by the input and has its own rules
  file, while Codex is gated by a setting and judges against every family. Counting it would make
  `L of A` change with the user's setup rather than the change.
- **Let `/start-cr` call Collegium itself** — rejected: the headless route would need a second
  caller and a second renderer, and the two routes' `codex.md` would drift.
- **Fail closed when Codex does not deliver** — rejected: Codex is an optional reader. Treating its
  absence as a missing lens would hold an fd3 branch, or open the proceed-or-abort menu, on a
  reader nobody required.
- **Declare collegium as a plugin dependency** — rejected: a missing declared dependency silently
  unloads the dependent plugin, so code-review would vanish for everyone without collegium.

## Consequences

- The change under review is sent to OpenAI whenever the Codex review runs. `ask` is the default
  so that nothing leaves the machine without a choice, besides enabling Codex in Collegium.
- A review with Codex can take up to an hour: the merge waits for the Codex run however long it
  takes within its limit.
- Codex findings whose family or rule the table does not hold never become graded findings
  directly; the merge promotes or clears each one.
- The Codex review exists only under Claude Code. Under the Codex CLI host it is never offered or
  run.

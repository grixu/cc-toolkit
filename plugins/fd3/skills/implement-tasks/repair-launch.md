# Launching repair-run

Read by `implement-tasks` step 4 when a decision changes an existing branch.

```
Workflow({
  scriptPath: "<the directory this file sits in>/../../workflows/repair-run.js",
  args: {
    repairs: [{ repo, branch, worktree, base, instructions: [<the user's decisions for this
               branch, quoted verbatim>], taskFiles: [<task files to flip to done on pass>] }, ...],
    repos: <as at launch>,
    specPath: <as at launch>,
    review: <as at launch>,
    decisions: <as at the latest launch>,
    reportPath: <the previous report's `<output-file>` path>,
    maxFixRounds: 3
  }
})
```

`base` is the branch's stack base (or the repo's `diffBase`). `reportPath` is the previous
report's output file; the workflow reads its toolchain and baseline knowledge itself, which is
what spares a full re-scout plus a full baseline pipeline on every repository in the run. Pass
the path, never the knowledge. Repair agents receive the decision as their sole
authority and never read the spec.

A repair reopens its branch. Before launch, set every `done` task on a repaired branch back to
`merged` and list it in that branch's `taskFiles` — the tasks were marked done on a tree the
repair is about to change, and only the repair's own validation may mark them again. Every
branch stacked on a repaired branch, transitively, joins `repairs` too, with `instructions: []`
and its own done tasks reset the same way: it carries the repaired base and owes it a CI run,
which a merge-up done by hand never gets. With
review on, the workflow reviews the repair's own commits after its CI passes, narrowly: one agent
checks the diff against the quoted decisions — a change no decision asked for, or a decision not
carried out — and only the `correctness` and `security` lenses read it. A finding rated safe in the
repair's own lines is fixed in the same run, with no further review of that fix (under `gated`,
never a security one, and never one that changes access or behaviour the spec states); the rest
come back as `review` items for the user and hold the branch only under `gated`. Findings in code
the repair did not touch are listed apart, never as open work.

An `instructions` line says what to change, never asks for validation. "Then run the tests and
confirm they pass", "verify the build is green" — the workflow runs CI itself, after the agent
returns, and an agent that runs it too puts a second pipeline on a machine that tolerates one.

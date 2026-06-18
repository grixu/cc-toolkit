# Two-tier research loop: assessor-gated rounds within a run, human steering between runs

Dynamic Workflows take no mid-run user input, yet we want both automatic deepening and human control
of direction. We split the loop in two:

- **Within a workflow run** the loop is autonomous: a **coverage assessor** subagent decides whether
  to run another round, based on subject complexity, accumulated context size, and explicit user
  intent (a "deep research" brief biases toward more rounds from the start). Bounded by a hard
  `maxRounds` cap per depth — **not** a token budget: Claude Code does not reliably expose one to a
  workflow (the `Workflow` `budget` is null unless the user sets an explicit token target), so *rounds*,
  not metered tokens, are the control lever. Fan-out caps still bound per-round concurrency.
- **Between workflow runs** the loop is human-steered: after a run the front-end skill shows the
  report plus the assessor's **ready-to-use follow-up questions**; the user selects any, adds their
  own, and that becomes the next run's brief.

**Why this split:** it is the only shape that gives mid-process human steering despite the
no-mid-run-input constraint, while letting simple queries finish in one round and complex / "deep"
ones auto-deepen without nagging the user.

**Trade-off:** the assessor is a heuristic judge, so an auto-stop can be wrong; the human checkpoint
and the "deep" intent override exist precisely to correct it.

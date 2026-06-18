# Orchestrate research with a skill-launched Dynamic Workflow, not inline subagent fan-out

The orchestrator can fan out retrieval two ways: **(C)** an inline skill spawning `Agent` subagents
turn-by-turn, or **(B)** a Dynamic Workflow the skill launches via the `Workflow` tool. We chose B.

**Why:** research retrieval is high-volume and verbose. In a workflow, intermediate scrapes live in
script variables and never enter the main context — only the final report returns. The joke-fanout
experiment showed 5 trivial workers burning ~213k tokens that, under B, stay out of the session. B
also gives codified, rerunnable orchestration and up to 16-way parallelism.

**Trade-off accepted:** workflows take no mid-run user input, so all interaction lives in the
front-end skill and "go deeper" is a relaunch between rounds; and B depends on Dynamic Workflows
being enabled.

**Note:** an earlier experiment suggested a skill *couldn't* launch a workflow — that was a
disabled-workflows false negative on a stale Pro auth. With workflows enabled the `Workflow` tool is
exposed and skill→workflow launch works (run `wf_0475f9cb-db9`).

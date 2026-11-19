---
paths:
  - "plugins/fd4/**"
---
# fd4 — plugin conventions

- Read `plugins/fd4/GOAL.md` before any fd4 change: it holds the goal and the non-negotiable rules. A change that breaks one of them waits for the user's decision.
- Each fd4 piece passes through the matching `agent-engineer` skill, loaded before the work starts:
  - reviewing a built agent-facing piece (skill, command, agent definition, rendered prompt), after its `writing-for-agents` pass: `agent-prompting`; for how a flow is split into steps, agents and models: `agent-design`; for what lands in an agent's window: `agent-context`;
  - building an eval, its dataset or a judge: `agent-evals`;
  - building tooling an agent calls (mod tools, scripts, decision-model calls): `agent-tools`; tooling that records runs or metrics: `agent-observability`.
- The eval material (real fd3 runs) and how to pull it are in `plugins/fd4/FD4_EVALUATION.md`.

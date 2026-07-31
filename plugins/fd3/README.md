# fd3

TBD

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install fd3@cc-toolkit
```

## Commands

| Invocation | Description |
|---|---|
| `/fd3:build-spec <topic>` | Entry point — delegates straight to the `grill-topic` skill |

## Skills

| Invocation | Description |
|---|---|
| `/fd3:grill-topic <topic>` | Grill the given topic, plan, decision or idea round by round until the design tree is fully explored |

`grill-topic` stays model-invocable so a command can delegate to it through the Skill tool.

## Sub-agents

| Agent | Purpose |
|---|---|
| `fd3:researcher` | Answers a single research question from external sources; dispatched by the skills, not by the user |

## Usage

```
/fd3:grill-topic our retry strategy for the payment webhook
```

Each round asks the whole current frontier of the design tree at once, with a recommended answer per
question, then waits for your answers before recomputing the frontier. Facts are looked up by sub-agents
(`Explore` for the codebase, `fd3:researcher` for documentation) — the decisions stay yours. The session
ends when the frontier is empty.

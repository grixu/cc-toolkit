# cc-toolkit

A Claude Code plugin marketplace with productivity tools.

## Installation

Add the marketplace:

```
/plugin marketplace add grixu/cc-toolkit
```

Then install individual plugins:

```
/plugin install <plugin-name>@cc-toolkit
```

## Available Plugins

### codex-plan-improver

Automatic plan review via OpenAI Codex CLI. Intercepts `ExitPlanMode` and sends plans through iterative Codex review (up to 5 rounds) before presenting to the user.

**Requires:** [OpenAI Codex CLI](https://github.com/openai/codex), `jq`

```
/plugin install codex-plan-improver@cc-toolkit
```

See [plugin README](plugins/codex-plan-improver/README.md) for details.

### feature-delivery

End-to-end feature delivery workflow — from requirements gathering through implementation orchestration with parallel subagents.

| Command | Description |
|---------|-------------|
| `/start [description]` | Begin requirements gathering (6-phase process) |
| `/current [id\|--all]` | Requirements dashboard — status, progress, actions |
| `/edit [id]` | Edit spec with full re-analysis and versioning |
| `/implement [id]` | Implementation orchestrator with parallel agents and quality gates |

```
/plugin install feature-delivery@cc-toolkit
```

See [plugin README](plugins/feature-delivery/README.md) for details.

### hookify

Create custom hooks to prevent unwanted behaviors using simple markdown rule files with regex pattern matching. No coding required — just describe the behavior to block or warn about.

| Command | Description |
|---------|-------------|
| `/hookify [instruction]` | Create a rule from instructions or analyze conversation for issues |
| `/hookify:list` | List all configured rules |
| `/hookify:configure` | Enable/disable rules interactively |

```
/plugin install hookify@cc-toolkit
```

See [plugin README](plugins/hookify/README.md) for details.

## License

MIT

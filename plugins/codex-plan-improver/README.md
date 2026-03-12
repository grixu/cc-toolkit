# codex-plan-improver

A Claude Code plugin that automatically reviews your implementation plans using OpenAI Codex CLI before you exit plan mode.

## How it works

1. You enter plan mode and build an implementation plan
2. When you try to exit plan mode, the hook intercepts and blocks
3. The `/codex-review` command is triggered automatically
4. Claude sends your plan to Codex for review
5. If Codex says "REVISE", Claude fixes the plan and re-submits (up to 5 rounds)
6. Once Codex approves, you exit plan mode with an improved plan

## Prerequisites

- [OpenAI Codex CLI](https://github.com/openai/codex) installed and configured
  ```bash
  npm install -g @openai/codex
  ```
- `jq` installed (used by the hook script)
  ```bash
  brew install jq  # macOS
  ```

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install codex-plan-improver@cc-toolkit
```

**Note:** Restart Claude Code after installation for hooks to take effect.

## Usage

### Automatic (recommended)

Just use plan mode normally. The hook intercepts `ExitPlanMode` and triggers the review automatically.

### Manual

```
/codex-plan-improver:codex-review
```

Or if no other plugin has a `codex-review` command:

```
/codex-review
```

### Model override

Pass a model name as an argument:

```
/codex-review o4-mini
```

Default model: `gpt-5.3-codex`

## Configuration

The default Codex model can be configured in `~/.codex/config.toml`. The plugin always uses read-only sandbox mode.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `CC_TOOLKIT_CODEX_PLAN_REVIEW` | _(unset — review enabled)_ | Set to `0` or `false` to skip automatic Codex review on plan exit |

When the variable is **unset** or set to `1`/`true`, the hook intercepts `ExitPlanMode` and triggers Codex review as usual. Any other value (e.g. `0`, `false`, `no`) disables the hook entirely.

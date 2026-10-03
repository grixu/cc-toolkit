# codex-plan-improver

A plan written by one model has that model's blind spots. This plugin gets a second opinion on a
Claude Code plan from OpenAI Codex before any code is written: Claude sends the plan to Codex,
revises it from Codex's feedback, and repeats until Codex approves or five rounds pass.

## Requirements

- [OpenAI Codex CLI](https://github.com/openai/codex), installed and signed in (`codex login`, or
  an API key in the environment):
  ```bash
  npm install -g @openai/codex
  codex login
  ```
- `jq` and `uuidgen` on `PATH`. macOS ships `uuidgen`; install `jq` with `brew install jq`.
- A writable `/tmp`. The plan, each review and a per-session flag file are written there.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install codex-plan-improver@cc-toolkit
```

If the install summary says a reload is needed, run `/reload-plugins` so the hook takes effect.

## Usage

### Review when leaving plan mode

Work in plan mode as usual. When Claude calls `ExitPlanMode`, a hook denies that call and tells
Claude to run `/codex-plan-improver:codex-review`. After the review, Claude calls `ExitPlanMode`
again, the hook lets it through, and you see the revised plan.

The hook asks for the review but cannot force it. It alternates per session: it denies an exit,
lets the next one through, then denies the one after that. So a plan you reject and Claude revises
is reviewed again on its next exit. If Claude skips the review and calls `ExitPlanMode` a second
time, that exit goes through unreviewed.

### Manual review

Run it at any point when a plan exists in the conversation:

```
/codex-plan-improver:codex-review
```

If there is no plan in the conversation, Claude asks what you want reviewed.

### Choosing the model

The default model is `gpt-6.1-sol`. The command passes it to `codex exec -m`, so the `model` setting
in `~/.codex/config.toml` does not apply. To use a different model, pass its name as the argument:

```
/codex-plan-improver:codex-review gpt-6-astra
```

Any model name your Codex CLI accepts for `codex exec -m` works.

## What you get

For each round, Claude shows:

- Codex Review — Round N: Codex's feedback on correctness, risks, missing steps, simpler
  alternatives and security, ending in `VERDICT: APPROVED` or `VERDICT: REVISE`.
- Revisions (Round N): what Claude changed in the plan, one bullet per issue.

Later rounds resume the same Codex session, so Codex keeps the context of earlier rounds. The
review ends with a final status: approved after N rounds, or "max rounds (5) reached" with the
remaining concerns listed. Claude skips any Codex suggestion that contradicts a requirement you
stated, and tells you it did so.

Codex runs in a read-only sandbox: it can read your repository but cannot change files.

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `CC_TOOLKIT_CODEX_PLAN_REVIEW` | unset (review on) | Any value other than `1` or `true` turns the plan-exit hook off. The manual command still works. |

```bash
export CC_TOOLKIT_CODEX_PLAN_REVIEW=0   # disable the plan-exit review
```

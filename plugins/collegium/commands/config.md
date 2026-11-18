---
description: Set up Collegium's model palette — detect Codex, show its models, and write the tier mapping and exclusions to the user or project config.
allowed-tools: Bash(codex --version) Bash(codex login status) Bash(codex debug models) Read Write AskUserQuestion
---

# /collegium:config

Write Collegium's JSON config: which model each tier (`high`, `medium`, `low`) uses and which models
are excluded, for the user or for this project. The two files:

- **User**: `${CLAUDE_PLUGIN_DATA}/config.json`. Use this path exactly as written here; never build
  the plugin's data folder by hand, because its name differs between a marketplace install and
  `--plugin-dir`.
- **Project**: `${CLAUDE_PROJECT_DIR}/.claude/collegium.json`. The project file overrides the user
  file field by field.

## 1. Detect Codex

Run each with Bash, one at a time:

1. `codex --version`. When it fails, say Codex is not installed and stop.
2. `codex login status`. When it reports logged out, say so and name `! codex login`; carry on, since
   the config does not need a login.
3. `codex debug models`. Its stdout is JSON with a `models` array. When it fails or is not that JSON,
   show the error with the Codex version from step 1 and stop: it is a diagnostic command whose
   output may change between versions.

## 2. Show the palette

From each model take `slug`, `visibility`, `default_reasoning_level` and the `effort` of each
`supported_reasoning_levels` entry. Show one table, a row per model, in the catalogue's order:

| Model | Efforts | Default effort | Hidden |
|---|---|---|---|
| `openai/<slug>` | … | … | `hidden` when `visibility` is `hide` |

Below it, say that a hidden model is left out of the palette unless it is mapped to a tier, and that a
mapped model is kept even when it is excluded.

## 3. Read the current config

Read both files. A missing file is an empty config. A file that is not valid JSON, or that has a field
outside the shape in step 5, is an error naming the file and the field: show it and stop, because
Collegium refuses to run on it too and the user has to fix it first.

Show what each file maps today under `harnesses.codex.palettes.openai` (tiers and exclusions), or
"nothing set".

## 4. Ask

Ask with `AskUserQuestion`, in one call when it fits:

1. **Scope**: "User (every project)" or "This project (`.claude/collegium.json`)".
2. **High tier**, **Medium tier**, **Low tier**: one question each. Offer up to three models from the
   palette that suit the tier (the larger, slower models for high, the smaller, faster ones for low,
   judging by the slug), the current mapping first when one exists, and "Leave unmapped". The user can
   type any other `openai/<slug>` through "Other".

Then ask, in a second call:

3. **Exclusions** (multi-select): up to four non-hidden models the user may want Collegium never to
   choose, current exclusions first, plus "None". "Other" takes a comma-separated list of
   `openai/<slug>` ids.

An answer naming a model that is not in the palette: say so and ask that question again.

## 5. Write

Start from the chosen file's current content (step 3) and change only
`harnesses.codex.palettes.openai`; keep `harnesses.order`, `harnesses.disabled`, `decision` and every
other harness as they are. Set `tiers` to the mapped tiers only (an unmapped tier is left out) and
`exclude` to the chosen exclusions (an empty list for "None"). The file's shape:

```json
{
  "harnesses": {
    "order": ["codex"],
    "disabled": [],
    "codex": {
      "palettes": {
        "openai": {
          "tiers": { "high": "openai/<slug>", "medium": "openai/<slug>", "low": "openai/<slug>" },
          "exclude": ["openai/<slug>"]
        }
      }
    }
  },
  "decision": { "backend": "auto" }
}
```

- `harnesses` holds `order` and `disabled` (arrays of harness ids) and one object per harness, which
  holds only `palettes`; each palette holds only `tiers` and `exclude`.
- `tiers` keys are only `high`, `medium` and `low`; every model is a `provider/model` id.
- `decision.backend` is `auto`, `typesafe` or `gemini`.

Write the whole file with `Write`, pretty-printed with two-space indentation, then show what was
written and its path.

## 6. Say whether Codex is on

Codex's switch is `${user_config.codex}`. Unless that reads exactly `true` (text still starting with
`${user_config.` means it was never set, which is off), say: "Codex is not enabled yet. Turn it on
with `/plugin configure collegium`; enabling it is your consent to send the task and the code Codex
reads to OpenAI." When the merged config lists `codex` in `harnesses.disabled`, say which file turns
it off.

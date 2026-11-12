# Options, inputs and output

This page lists the plugin options, the inputs of the `pr_risk` tool and the fields of its result. For what the values mean, see [How a risk level is computed](how-it-works.md).

## Plugin options

Open the options with `/plugin configure dev-kit@cc-toolkit`. A change takes effect after `/reload-plugins`.

| Option | Default | What it does |
|---|---|---|
| `typesafe_api_key` | empty, reads `TYPESAFE_API_KEY` | The TypeSafe API key. Without one, the tool doesn't exist and nothing is sent. |
| `typesafe_endpoint` | `https://api.typesafe.ai` | Base URL of the API. `/v1/systemone` is appended. |
| `typesafe_model` | `jev-1.14.0` | Model name or alias. Pin a version to keep levels stable across Jev releases. |
| `gemini_api_key` | empty, reads `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY` | A Gemini Developer API key with access to `gemini-decision-1`. A Vertex AI key doesn't work: the Decisions API exists only on the Gemini Developer API. |
| `decision_backend` | `auto` | `auto` uses the backend whose key is set; with both keys, `pr-open` asks which to use. `typesafe` or `gemini` uses that one. `both` runs them side by side. |
| `primary_backend` | `typesafe` | With both backends, the one whose level, flags and label count. The other's level appears beside it. |
| `risk_label` | `true` | Whether `pr-open` labels the pull request. |
| `risk_label_name` | `risk: {level}` | The label name. `{level}` becomes the level. |
| `risk_levels` | `low`, `medium`, `high`, `critical` | Names of the four levels, from lowest to highest. Any count other than four falls back to the default. |

## Tool inputs

Claude calls the tool as `mcp__dev-kit__pr_risk`. `pr-open` calls it for you, and Claude can also call it when you ask how risky a branch is. There's no slash command.

| Input | Required | What it does |
|---|---|---|
| `base` | yes | The branch the change merges into, such as `main`. The tool diffs `origin/<base>...HEAD`, or `<base>...HEAD` without a remote branch. |
| `slices` | no | The changed files grouped by purpose, each `{title, files}`. Without it, Claude Haiku groups the files. See [Group the files into slices](how-it-works.md#step-2-group-the-files-into-slices). |
| `context` | no | The pull request's and ticket's titles and descriptions. It tells Jev what each slice is for, and it's where the tool looks for manual evidence. A **Risk** section that `pr-open` wrote earlier is removed before it's sent. |
| `testing_policy` | no | The repository's testing rules, in a few sentences. It decides whether a slice without tests breaks those rules. |
| `execution_context` | no | Up to 8 entries of short, exact source excerpts for changed files, each checked against a full base or HEAD commit ID. Only the matching slice's diff request receives them. |
| `risk_policy` | no | `calibrated-v1` (default) or the stricter, unvalidated `evidence-v1`. It affects only the [two-axis fallback](reliability.md#the-two-axis-fallback). |
| `risk_experiment` | no | `atomic-v1` adds experimental questions whose answers appear under `experimental`. They don't change the level. |
| `backend` | no | `typesafe`, `gemini` or `both`: the user's answer after a `Backend choice needed:` result. It overrides `decision_backend`. |

Everything in `context`, `testing_policy` and `execution_context` is sent to the chosen backend, TypeSafe or Google, along with the diff and the commit messages; with `both`, to each.

## Result

The tool returns JSON. A result that starts with `Risk assessment unavailable:` means no assessment was made, and the rest of the text gives the reason. A result that starts with `Backend choice needed:` means both keys are set and `decision_backend` is `auto`: nothing was sent, and the call needs `backend`.

### The whole change

| Field | What it holds |
|---|---|
| `level` | The risk level, one of the four `risk_levels`. |
| `scorer` | `factors`, or `two-axis fallback` when no factor request answered. |
| `impact.level`, `likelihood.level` | The worst impact and the worst likelihood across slices. |
| `complexity` | The highest complexity across slices. |
| `evidence` | `needed`: the manual evidence types Jev finds plausible. `provided`: those found in `context`. `credited`: whether any slice's likelihood was lowered for them. |
| `adjustments` | The rules that moved the level, in plain sentences. |
| `confidence`, `lowConfidence` | See [Confidence and `lowConfidence`](reliability.md#confidence-and-lowconfidence). |
| `intents` | What the change does, from the intent requests. |
| `types` | The change types found in any slice. |
| `flags` | Risk flags, each `{key, label}`. |
| `slices` | One entry per slice, described below. |
| `label` | `enabled`, the label `name` for this level, and `all` label names, so `pr-open` can remove the old one. |
| `coverage` | How much of the change was assessed, described below. |
| `comparison` | Only with both backends: one entry per backend, primary first, with `backend`, `model`, `level`, `impact`, `likelihood`, `complexity`, `confidence`, `lowConfidence`, `scorer` and each slice's `title`, `level`, `impact` and `complexity`; or `backend` and `error` for one that failed, while the other's result stands. Each comparison is also appended to `~/.cache/dev-kit/compare.jsonl` with the repository's directory name, branch, commit and base, never the diff. |
| `backend`, `model`, `base`, `riskPolicy`, `slicing` | The backend (`typesafe` or `gemini`) and model that answered, the resolved base, the policy used, and where the slices came from (`caller`, `model` or `size`). |

### Each slice

Each entry of `slices` holds `title`, `files`, `level`, `impact`, `likelihood`, `complexity`, `evidence`, `testGap`, `adjustments`, `intents`, `types` and `flags`. A slice whose factor requests all failed holds `factors: "missing"` and keeps its diff request's `level`, `impact` and `likelihood`.

### Coverage

| Field | What it holds |
|---|---|
| `requests` | The number of diff requests sent. |
| `filesAssessed`, `filesNotAssessed` | Files read and files beyond the request cap. |
| `filesNotAssessedSample` | Up to 20 of the files not assessed. |
| `filesExcluded` | Lockfiles, binaries and generated files left out. |
| `truncatedHunks` | Hunks cut to fit a request. |
| `factorsMissing` | Slices, or parts of a split slice, without factor answers. |
| `partial` | Whether code went unread or a slice lacks factor answers. |

## Change types and flags

The diff request asks about these change types. The ones in the table raise a flag:

| Flag | Raised by |
|---|---|
| Touches security | `authorization`, `authentication`, `secret_handling` |
| Changes persisted data | `schema_or_data_migration`, `data_removal_or_rewrite` |
| Changes a public contract | `api_contract` |
| Changes CI, infrastructure or deployment | `ci_cd_pipeline`, `cloud_infrastructure`, `runtime_environment` |
| Logic without tests | a slice with code that adds, changes or fixes behavior and has no test |

The other change types describe the slice without raising a flag:

- **Risk signals:** `irreversible_external_effect`, `infrastructure_state_dependent`, `team_only_scope`, `data_access`, `dependency_added_or_removed`, `feature_flag_gated`, `ui_components`, `ui_interactions`, `build_and_dev_tooling`, `dependency_version_update`, `ai_assistant_instructions`.
- **Tests:** `unit_or_integration_tests`, `e2e_tests`, `performance_tests`, `infrastructure_tests`.
- **What much of the slice is about:** `observability`, `error_handling_and_validation`, `visual_styling`, `configuration`, `documentation`, `generated_artifacts`, `release_metadata`.

The intents are `new_functionality`, `behavior_change`, `behavior_condition_change`, `bug_fix`, `refactor`, `rename_or_move` and `code_removal`.

## Labels

When `risk_label` is on, `pr-open` adds the label for the level and removes every other risk label the pull request carries. It creates a missing label once, and never changes an existing label.

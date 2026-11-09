# PR risk evaluation

Run from the repository root with a recent Node version that supports TypeScript imports:

```sh
node plugins/dev-kit/evals/pr-risk/run.mjs --tag baseline
node --test plugins/dev-kit/evals/pr-risk/*.test.mjs
```

Live runs require `TYPESAFE_API_KEY` and the Claude Agent SDK's authenticated session for fallback slicing. Both the tool and runner default to the pinned `DEFAULT_MODEL` in `hooks/evidence.ts` (`jev-1.14.0`); `--model` overrides it for an experiment. Private datasets and evidence belong in the ignored `local/` directory. Results go to `evals/.results/pr-risk/`.

`--risk-policy calibrated-v1` is the default scoring policy. `--risk-policy evidence-v1` opts into stricter rules for risk reductions. This scoring experiment is independent of `--risk-experiment atomic-v1`, which changes the questions sent to the model. Result summaries and case reports identify the selected policy. Exact recordings can compare scoring policies when their model requests remain unchanged.

`--variant causal-impact-v1` changes only the impact question's instructions in diff requests, and `--variant semantic-likelihood-v1` only the likelihood instruction. Both are evaluation-only, leave scoring unchanged, and did not meet their promotion gates. The default `dominance` and legacy `presence` and `v2` variants remain available. Unknown variant names are rejected.

## Read the metrics

`summary.metrics.endToEndExactAccuracy` divides correct **completed** assessments by every labelled case selected for the run, including preparation errors, failed requests and incomplete assessments. `wilson95` gives a 95% Wilson confidence interval for that proportion. An interval is not evidence that a 95% accuracy target has been met on fresh PRs.

`completed`, `failed` and `incomplete` partition the cases. A failure takes precedence over a returned prediction. A partial report, an explicitly incomplete report or a missing level counts as incomplete. `answered` counts any valid returned level and can overlap failures or incomplete reports. `completeAssessmentAccuracy` is selective accuracy; read it alongside `completeAssessmentCoverage`. The confusion matrix includes failure and incomplete columns. Class recall includes these cases in its support; precision uses completed predictions. Dangerous underestimates count returned low/medium predictions for high/critical labels and show how many were completed.

The older `exact`, distance, axis and flag fields use completed assessments. The experimental summary separately counts requested, completed and incomplete experimental assessments, missing reports, and present/absent/unknown/missing signals. An experiment with all answers present can still contain unknowns; response completeness does not validate those answers or change production risk decisions.

## Replay and frozen slices

```sh
node plugins/dev-kit/evals/pr-risk/run.mjs --replay path/to/results.json --tag replay
```

Jev requests must match their full request hash, including model, questions and state. Existing exact SHA1 keys remain accepted; new recordings include SHA256 hashes, question/state hashes and response models. Identical requests consume answers in recorded order. Prompt changes require fresh responses. `--replay` never calls the slicing SDK and rejects `--gh-context`; supply PR context through the dataset or `--prs` instead. Git repositories and required commits must also be available locally for a fully offline run.

New `--slicing-cache` entries include the slicing request hash. Existing id-only caches require `--allow-legacy-slicing-cache`, which explicitly freezes an unverified partition. Old Jev recordings without request hashes require the separate `--allow-legacy-replay` flag, allowing weaker kind/title/length matching. Neither legacy mode validates changed prompts. Provenance records both opt-ins and actual legacy uses.

`evaluationScope` and each case's provenance distinguish caller slices, fallback slicing, frozen caches, context and execution evidence. A replay or frozen-slicing run measures an assessment component. A benchmark of the full `pr-open` workflow needs that caller's actual slice generation and context collection, fresh responses, and independently labelled PRs. Existing development corpus agreement does not establish that quality.

## Evidence and experimental questions

`--execution-context local/evidence.json` accepts an object keyed by dataset case id. Each value is the tool's execution context array:

```json
{
  "case-id": [
    {
      "path": "src/changed.ts",
      "sources": [
        {
          "path": "src/caller.ts",
          "ref": "<full base or head commit SHA>",
          "symbol": "optional source symbol",
          "facts": ["exact excerpt from that committed source"]
        }
      ]
    }
  ]
}
```

Dataset cases may also carry `execution_context`; the external mapping takes precedence. The tool validates source excerpts, commit refs and size bounds, and sends evidence only to the relevant slice. Provenance stores evidence hashes and presence; the requests retain the supplied evidence in their state.

Add `--risk-experiment atomic-v1` to request the optional enforcement, external-effect, data-integrity, shared-path and ordering questions. Each question has a paired evidence-sufficiency answer. Results appear under each case's `experimental` field and the separate summary; missing or invalid answers remain incomplete and uncertain evidence remains unknown. Changed experimental questions, evidence or state need a fresh live run. These signals do not alter the production risk level.

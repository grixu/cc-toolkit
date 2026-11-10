---
title: Confidence, partial results and failures
description: When to trust a risk level less, and what happens when part of the change can't be assessed.
---

A risk level is only as good as what the model saw and answered. This page explains the signals that a level deserves less weight. It also explains what happens when part of the change can't be read or Jev doesn't answer. It assumes you know the steps from [How a risk level is computed](/plugins/dev-kit/risk-assessment/how-it-works/).

## Confidence and `lowConfidence`

`confidence` is Jev's own confidence in its impact and likelihood answers for the riskiest slice, as rated by the diff requests. It's the lower of the two, from 0 to 1.

The result sets `lowConfidence` when the confidence is below 0.5, or when the assessment is partial. `pr-open` then adds `Low confidence.` to the first line of the **Risk** section.

A low-confidence level isn't wrong by default. Check it against the diff instead of relying on it.

## Partial assessments

An assessment is partial when some code wasn't read, or a slice got no factor answers. The result sets `coverage.partial`, and the **Risk** section adds a line such as `Partial assessment: 12 files and 3 cut hunks were not assessed.`

The tool fits a large change into Jev's request size in these ways:

- A slice too large for one request is split by file, and a large file by hunk.
- A request that Jev still refuses as too long is halved and sent again, up to three times.
- A slice split into several requests takes the risk of its riskiest part, and every change type any part found.
- The whole change gets at most 32 diff requests. Files beyond that aren't assessed, and the result lists up to 20 of them in `coverage.filesNotAssessedSample`.

Not every cut makes an assessment partial. Docs, and data files under test paths, are cut to one request's worth, and a cut there leaves every line of code assessed.

## When Jev doesn't answer

What happens depends on which request fails:

| Failed request | Result |
|---|---|
| A diff or intent request | The assessment is unavailable. `pr-open` opens the pull request without a **Risk** section or label and reports the reason. |
| A slice's factor requests | The slice keeps the level from its diff request and shows `factors: "missing"`. The level of the change doesn't drop below that slice's level. The assessment is partial. |
| Every factor request | The level comes from the diff requests alone, and `scorer` is `"two-axis fallback"`. |
| A policy request | The "Logic without tests" flag stays. |
| Haiku's slicing | The diff is packed by size and assessed as one unsliced change. `slicing.reason` says why. |

A slice counts as missing only when both repeats of its factor requests failed. One answered repeat is enough to score it.

The fallback exists so that a Jev outage never clears a pull request. A slice without factor answers would otherwise add no risk, and the change could rate below its real risk.

### The two-axis fallback

Without factor answers, the level comes from the diff request's own impact and likelihood answers, through the same [risk matrix](/plugins/dev-kit/risk-assessment/how-it-works/#the-risk-matrix). Weighting rules then adjust them with the change types from the same request:

- A change to what the system sends outside itself, such as messages or payments, raises impact to severe.
- A security or persisted-data change raises impact to severe when Jev gives a severe outcome a probability of at least 0.3.
- A behavior change raises impact to at least feature, or minor for a change that only alters how a screen looks.
- Infrastructure that holds data or serves traffic raises impact to core and likelihood to non-trivial.
- A change that reaches only the team's local setup, agent rules or alerts caps impact at minor. The cap doesn't apply when the slice touches secrets, authentication, authorization or external effects, or Jev rates it severe.
- A major-version dependency bump raises likelihood to non-trivial.
- A pure rename or move caps likelihood at simple, and a slice of docs alone is capped at minor impact and simple likelihood.

The `risk_policy` input changes only these rules. The default `calibrated-v1` keeps all of them. The experimental `evidence-v1` drops the reductions: the UI, rename, docs-only and major-version rules, and it narrows the team-only cap.

## What the assessment doesn't do

- It doesn't run your code or your tests. It reads the diff.
- It doesn't read code outside the diff, unless the caller passes short excerpts as `execution_context`. A change whose risk lies in how other code calls it can rate too low.
- It doesn't know your traffic, your users or your deployment process. "Core flow" is Jev's reading of the code.
- It doesn't review the change. A low level says a mistake would cost little or is unlikely, not that the change is correct.

## How the scorer is evaluated

The factor scorer is measured against pull requests that people labelled with a risk level. The labelled data comes from private repositories, so it isn't in this repository. The evaluation scripts are, in `plugins/dev-kit/evals/pr-risk/`. Its [README](https://github.com/grixu/cc-toolkit/blob/main/plugins/dev-kit/evals/pr-risk/README.md) explains the metric and how to run the evaluations.

## Next steps

- [Options, inputs and output](/plugins/dev-kit/risk-assessment/reference/): every result field, including `coverage`.
- [Risk assessment overview](/plugins/dev-kit/risk-assessment/): what the **Risk** section shows.

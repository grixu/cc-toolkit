---
title: The risk label
description: What the risk label that pr-open puts on a pull request means, what the Risk section shows, what leaves your machine, and how to turn it on.
group: concepts
sidebar:
  label: The risk label
  order: 6
---

A reviewer who opens a pull request can't tell from its title how carefully to read it.
[`/dev-kit:pr-open`](/plugins/dev-kit/pr-open/) answers that before they open the diff.
It rates the branch's risk when it opens or refreshes a pull request, ends the description with a **Risk** section, and adds a label such as `risk: high`.

This page explains what you see and how to turn the label on.
[How a risk level is computed](/plugins/dev-kit/risk-assessment/how-it-works/) explains the scoring.
[Confidence, partial results and failures](/plugins/dev-kit/risk-assessment/reliability/) explains when to trust a level less.

## What the risk level means

A risk level is one of four values: `low`, `medium`, `high` or `critical`.
It combines two questions about the change:

- **Impact:** if the change holds a mistake, how bad is the worst outcome once it ships?
- **Likelihood:** how likely is the change to hold a mistake?

A large change isn't high risk by default.
A rename across hundreds of files is mechanical, so its likelihood stays low.
A ten-line change to who can read customer data can be high or critical.

| Level | What it asks of a reviewer |
|---|---|
| `low` | A mistake would be harmless or cosmetic, or the change to one feature is mechanical. A quick read is enough. |
| `medium` | A mistake could break one feature, or a mechanical edit touches something more important. Read the logic. |
| `high` | Non-trivial logic could break a core flow, intricate logic could break a feature, or a small edit could do severe harm. Review it line by line and check how it was tested. |
| `critical` | A mistake could expose or lose data, or cause effects a revert can't undo, and the logic isn't trivial. Get a second reviewer. |

Table 1. The four risk levels

The level comes from a decision model, [TypeSafe's Jev](https://docs.typesafe.ai/introduction) or Google's [Gemini Decision](https://aistudio.google.com/docs/decisions-api), so treat it as evidence, not a verdict.
`pr-open` quotes it as returned and never adjusts it.

## What you see on the pull request

`pr-open` ends the description with a **Risk** section like this one:

```markdown
## Risk

**high** · impact core · complexity interacting logic · confidence 0.61 · assessed by jev-1.14.0

- Changes a public contract

| Slice | Risk | Impact | Complexity | Evidence | What it does | Change types |
|---|---|---|---|---|---|---|
| Order export endpoint | **high** | core | interacting logic | api_dump missing | new_functionality | api_contract, data_access |
| Export docs | **low** | none | edits | — | new_functionality | documentation |
```

Read it from the top down:

- **The first line** gives the level of the whole change, its impact and complexity, and the model's confidence. `Low confidence.` at the end of that line means the level deserves less weight.
- **The bullets** are risk flags: security, persisted data, public contracts, CI or infrastructure, and logic without tests. A flag points at what to look at. It doesn't set the level.
- **The table** has one row per slice, riskiest first. A slice is one purpose of the change, such as a feature, a fix or a refactor, with its code, tests and docs.
- **Evidence** lists the manual proof that would show the slice works: a video, screenshots or an API request and response (`api_dump`). Each is marked `provided` or `missing`. `test gap` means the slice changes behavior and has no test, though one could be written.
- **Lines under the table** name the rules that moved a slice's level, such as "likelihood lowered one step: the description carries the manual evidence this low-stakes change needs."

The label follows the level.
When a refresh changes the level, `pr-open` swaps the old label for the new one.

## What leaves your machine

The assessment sends the following to the backend's API, TypeSafe's or Google's, and with both backends to each:

- the diff of the branch against its base, without lockfiles, binaries and the other files the tool [leaves out](/plugins/dev-kit/risk-assessment/how-it-works/#step-1-read-the-diff);
- the commit messages;
- the `context` that `pr-open` passes: the pull request's title and description, and the linked ticket's title and description when it read them;
- the repository's testing rules, when `pr-open` found them in `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING` or CI;
- short source excerpts, when the caller passes `execution_context`.

When `pr-open` doesn't group the files into slices itself, the tool asks Claude Haiku to do it, on your Claude Code account.
Haiku gets the file paths, line counts, hunk headers and commit messages, but not the diff.

Without a TypeSafe or a Gemini key, nothing is sent.
The tool doesn't exist, and `pr-open` reports `Risk: not assessed`.

With both backends, each pair of results is also logged to `~/.cache/dev-kit/compare.jsonl` on your machine.
The log holds the levels, the repository's directory name, the branch, the commit and the base, never the diff.

## Turn it on

The risk label needs Claude Code v2.1.287 or later, which loads the plugin's mod, and an API key for at least one backend:

- **TypeSafe:** a [TypeSafe](https://docs.typesafe.ai/introduction) API key.
- **Gemini Decision:** a Gemini Developer API key with access to `gemini-decision-1`. A Vertex AI key doesn't work.

Set a key in one of two ways:

- Export `TYPESAFE_API_KEY`, or `GEMINI_DECISIONS_API_KEY` (falling back to `GEMINI_API_KEY`), in the shell you start Claude Code from.
- Or run `/plugin configure dev-kit@cc-toolkit` and enter it as the **TypeSafe API key** or **Gemini API key** option. Claude Code keeps it in your system's credential store, and it takes precedence over the variable.

A key set or changed during a session takes effect after `/reload-plugins`.
[Risk label reference](/plugins/dev-kit/risk-assessment/reference/) lists the other options, such as the label name and the model version.

The tool behind the label is `pr_risk` (`mcp__dev-kit__pr_risk`).
There's no slash command for it: `pr-open` calls it, and Claude can also call it when you ask how risky a branch is.

## Choose a backend

The **Decision backend** option (`decision_backend`) picks the backend:

| Value | What happens |
|---|---|
| `auto` (default) | The tool uses the backend whose key is set. With both keys, `pr-open` asks you whether to use TypeSafe, Gemini or both, and suggests saving the answer in this option. |
| `typesafe` or `gemini` | Only that backend assesses the change. Without its key, the assessment is unavailable. |
| `both` | Both keys are needed, and the two backends run side by side. The **Primary backend** option (`primary_backend`, TypeSafe by default) sets the level, the flags and the label. The **Risk** section shows the other backend's level beside it and says whether the two differ. |

Table 2. Values of the Decision backend option

When one of two backends fails, the other one's result stands.

Keep TypeSafe as the primary backend for now.
The scoring thresholds were calibrated on Jev's answers.
On the development cohort, Gemini Decision matches Jev's overall cost, but rates more high-risk changes too low.
[How the scorer is evaluated](/plugins/dev-kit/risk-assessment/reliability/#how-the-scorer-is-evaluated) gives the numbers.

## Get a better assessment

- **Write the description first.** The description tells the model what each slice is meant to do, such as add a feature or fix a bug.
- **Attach the manual evidence.** A screenshot, a video, a Loom link, or a request and response in a code block can lower a low-stakes slice's likelihood one step. New pull requests rarely carry it, so run `pr-open` again after you attach it to refresh the **Risk** section.
- **Keep tests beside the code they test.** A test file in the change with a matching name counts as a test for that file.
- **State your testing rules** in `CLAUDE.md`, `AGENTS.md` or `CONTRIBUTING`. A slice that your rules don't expect to be tested, such as Terraform or end-to-end-only UI, then loses the "Logic without tests" flag.

## Next steps

- [How a risk level is computed](/plugins/dev-kit/risk-assessment/how-it-works/): slices, the questions asked, and the scoring rules.
- [Confidence, partial results and failures](/plugins/dev-kit/risk-assessment/reliability/): what a partial or low-confidence result means.
- [Risk label reference](/plugins/dev-kit/risk-assessment/reference/): plugin options, tool inputs and result fields.

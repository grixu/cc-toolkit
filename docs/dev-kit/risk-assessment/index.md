# Risk assessment

dev-kit's risk assessment rates how risky a pull request is, so you can tell how carefully to review it before you read the diff. `pr-open` runs it when it opens a pull request or refreshes one. The result goes into the description's **Risk** section and onto a `risk: <level>` label.

This page explains what you see and how to turn the assessment on. [How a risk level is computed](how-it-works.md) explains the scoring. [Confidence, partial results and failures](reliability.md) explains when to trust the result less.

## What the risk level means

A risk level is one of four values: `low`, `medium`, `high` or `critical`. It combines two questions about the change:

- **Impact:** if the change holds a mistake, how bad is the worst outcome once it ships?
- **Likelihood:** how likely is the change to hold a mistake?

A large change isn't high risk by default. A rename across hundreds of files is mechanical, so its likelihood stays low. A ten-line change to who can read customer data can be high or critical.

| Level | What it asks of a reviewer |
|---|---|
| `low` | A mistake would be harmless or cosmetic, or the change to one feature is mechanical. A quick read is enough. |
| `medium` | A mistake could break one feature, or a mechanical edit touches something more important. Read the logic. |
| `high` | Non-trivial logic could break a core flow, intricate logic could break a feature, or a small edit could do severe harm. Review it line by line and check how it was tested. |
| `critical` | A mistake could expose or lose data, or cause effects a revert can't undo, and the logic isn't trivial. Get a second reviewer. |

The level comes from a model, [TypeSafe's Jev](https://docs.typesafe.ai/introduction), so treat it as evidence, not a verdict. `pr-open` quotes it as returned and never adjusts it.

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

The label follows the level. When a refresh changes the level, `pr-open` swaps the old label for the new one.

## What leaves your machine

The assessment sends the following to TypeSafe's API:

- the diff of the branch against its base, without lockfiles, binaries, minified, generated or build output files;
- the commit messages;
- the `context` that `pr-open` passes: the pull request's title and description, and the linked ticket's title and description when it read them;
- the repository's testing rules, when `pr-open` found them in `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING` or CI;
- short source excerpts, when the caller passes `execution_context`.

When `pr-open` doesn't group the files into slices itself, the tool asks Claude Haiku to do it, on your Claude Code account. Haiku gets the file paths, line counts, hunk headers and commit messages, but not the diff.

Without a TypeSafe API key, nothing is sent. The tool doesn't exist, and `pr-open` reports `Risk: not assessed`.

## Turn it on

The assessment needs Claude Code v2.1.287 or later, which loads the plugin's mod, and a [TypeSafe](https://docs.typesafe.ai/introduction) API key. Set the key in one of two ways:

- Export `TYPESAFE_API_KEY` in the shell you start Claude Code from.
- Or run `/plugin configure dev-kit@cc-toolkit` and enter it as the **TypeSafe API key** option. Claude Code keeps it in your system's credential store, and it takes precedence over the variable.

A key set or changed during a session takes effect after `/reload-plugins`. [Options, inputs and output](reference.md) lists the other options, such as the label name and the model version.

## Get a better assessment

- **Write the description first.** The description tells the model what each slice is meant to do, such as add a feature or fix a bug.
- **Attach the manual evidence.** A screenshot, a video, a Loom link, or a request and response in a code block can lower a low-stakes slice's likelihood one step. New pull requests rarely carry it, so run `pr-open` again after you attach it to refresh the **Risk** section.
- **Keep tests beside the code they test.** A test file in the change with a matching name counts as a test for that file.
- **State your testing rules** in `CLAUDE.md`, `AGENTS.md` or `CONTRIBUTING`. A slice that your rules don't expect to be tested, such as Terraform or end-to-end-only UI, then loses the "Logic without tests" flag.

## Next steps

- [How a risk level is computed](how-it-works.md): slices, the questions asked, and the scoring rules.
- [Confidence, partial results and failures](reliability.md): what a partial or low-confidence result means.
- [Options, inputs and output](reference.md): plugin options, tool inputs and result fields.

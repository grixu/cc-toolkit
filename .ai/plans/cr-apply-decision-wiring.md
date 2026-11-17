# Wire the apply decision into start-cr

The structural walk asks the owner about every fix; the decision model (`hooks/apply-decision.ts`)
answers 31.6% of them on Gemini with no fix applied against the owner. This wires it into
`/start-cr` as a mod tool, with the backend — Jev or Gemini — chosen by the user.

- [x] `hooks/hooks.json` + `hooks/register.ts`: the mod registers `apply_decision` on
  `session.start` only when `decision_backend` is not `off` and a key is set, so nothing leaves the
  machine without an explicit opt-in.
  - Input: `context` (the review's context directory), `findings` (id, severity, family, rule, path,
    lines, boy_scout, problem, fix), optional `scope`, `conventions` (the report's lines) and
    `backend` (`typesafe` | `gemini`, the user's answer after a choice-needed result).
  - The tool reads `scope.json` for the checkout, `diff_args` and changed files, and builds each
    finding's excerpt and hunk the way the eval recovered them (±12 lines, overlapping `-U3`
    hunks), so production input matches what was measured.
  - `security`, `spec` and boy-scout findings are never sent: they return `ask` (not measured, or
    the owner declined boy-scout fixes 5 times in 13).
  - A failed request, a missing answer or a missing file returns `ask` for that finding.
  - Returns JSON: backend, model, and per finding `apply | ask` with the reasons and both
    probabilities.
- [x] `apply-decision.ts`: `linesOf`, `excerptAround`, `hunksAround`, `inertConventions` as pure
  functions the tool uses and tests cover.
- [x] `plugin.json` `userConfig`: `decision_backend` (`off` default, `auto`, `typesafe`, `gemini`),
  `typesafe_api_key`, `typesafe_endpoint`, `typesafe_model`, `gemini_api_key`, as in dev-kit.
- [x] `commands/start-cr.md` Step 6: before the first walk question, call the tool once with the
  walk's findings; `apply` fixes land without their own question, `ask` fixes are walked as before;
  a choice-needed result is one `AskUserQuestion` (Jev or Gemini); without the tool, or when it is
  unavailable, every fix is walked. The wrap-up lists the fixes applied on the model's decision.
  `allowed-tools` gains the tool.
- [x] Tests (`node --test`) for the helpers and the tool's core with a stubbed `$`.
- [x] README (configuration, what is sent), CHANGELOG `[Unreleased]`, `claude plugin validate`.

Not in this plan: fd3's headless review (`cr-merge` callers), a release.

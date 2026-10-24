# fd3 eval suite — working rules

Rules for working inside `plugins/fd3/evals/`. All of them were earned the hard way;
follow them before improvising.

## Layout

Four configs: `promptfooconfig.yaml` (default suite, runs concurrently),
`promptfooconfig.e2e.yaml` (serial write→validate→split chain over one shared sandbox,
`evaluateOptions.maxConcurrency: 1`), `promptfooconfig.network.yaml` (researcher group;
needs `FIRECRAWL_API_KEY` and `CONTEXT7_API_KEY` in the environment),
`promptfooconfig.implement.yaml` (implement group, see below). Slash-command
prompts live in `prompts/*.txt` (a `prompts:` entry starting with `/` parses as a file
path, hence the `{{query}}` + `file://` indirection). Assertions live in `lib/`;
pristine scenario inputs in `fixtures/`; `.sandbox/` and `.results/` are git-ignored
and regenerated.

### Implement group

`/fd3:implement` does its work inside workflow agents, whose prompts exist only once
`implement-run.js` renders them. An agent scenario has no prompt file: its provider,
`lib/implement-provider.mjs`, runs the real script through the model-free harness
(`tests/workflows/harness.mjs`, scripted replies from `fixtures.mjs`), keeps the one
call `lib/implement-scenarios.mjs` names, and runs that prompt as a single live agent
with the call's own model, effort and schema (`output_format`), so the output is the
agent's structured result. A model the script does not pin is the config's
`claude-opus-5-5`; the CI runner's `haiku` therefore shows as a model mismatch in the
summary, by design. The provider delegates to promptfoo's `anthropic:claude-agent-sdk`
provider (`loadApiProvider`), which keeps its cost, `modelUsage` and `toolCalls`
metadata — a YAML provider config cannot carry a run-time prompt or a hook callback.
Agent scenarios run with background tasks enabled (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=0`,
overriding the runner) because the workflow's agents have `run_in_background` and
`Monitor`, and abandoning a backgrounded build is the failure they test. The fixtures
put the task files outside the sandbox's git root and record the task branch's head in
`.sandbox/.origins/<scenario>/branch-head`, out of every agent's reach.

A skill scenario (`implement-consent-batch`) runs `/fd3:implement` headless from its
`prompts/` file, with the plugin loaded and `ask_user_question: first_option`. The
provider's PreToolUse hook on `Workflow` snapshots the task files into
`metadata.fd3.workflowCalls` and denies the call, so the run ends at its launch and the
check reads the files as the workflow's agents would have received them. The "first
batch" is every AskUserQuestion call made before the first Edit, Write or Workflow
call, read from the top-level `metadata.toolCalls`. A second hook denies any
`claude plugin enable|disable|install|uninstall|update`: step 2 offers enabling
code-review as part of its review answer, and `first_option` took it on a live trial,
writing the operator's real user settings.

`implement-ci-waits-long-command` must hold every time: its intended gate is pass^3
(`scripts/run-evals.sh fd3 implement-ci --trials 3`). It sleeps 200 s by design.
None of the group is in the CI smoke filter.

## Running

- Always run via `scripts/run-evals.sh fd3 [pattern]` from the repo root — it resets
  every sandbox first and picks the config by pattern prefix: `e2e*` → serial config,
  `researcher*` → network config, `implement*` → implement config, anything else
  filters the default config.
- For variance, use `--trials <k>`: k sequential runs of the selected config, every
  sandbox reset before each trial. The runner rejects promptfoo's `--repeat` — its
  copies run concurrently in the one sandbox the run reset, and eight runs saw or
  deleted each other's writes. The same holds for `repeat` set in a config.
- The e2e chain under `--trials` stays safe: each trial replays write→validate→split
  serially (`maxConcurrency: 1`) from a fresh `.sandbox/e2e-chain`. Never run two
  invocations of the runner at once — they share `.sandbox/`, and the second one's
  reset wipes the first one's chain mid-run.
- Every run is archived in `.results/runs/<UTC>-<sha>[-dirty]/`: `trial-<i>.json`,
  `meta.json` (SHA, config, filter, configured target/grader model, tool versions)
  and `summary.json` (per test: passes/trials, Wilson 95% interval, pass^k,
  failures vs errors, cost, latency, actual model), printed at the end of the run;
  re-print one with `node scripts/eval-summary.mjs <run-dir>`.
- Scenarios take minutes each. Triage from the run dir, or from
  `plugins/fd3/evals/.results/latest.json` (the last trial of the last run) — never
  re-run just to read a result.

## Naming

- Scenario names are `<skill>-<what-it-proves>` (e.g. `validate-defective-spec`,
  `split-baseline`, `e2e-step2-validate-spec`). One name is used verbatim as the test
  description, prompt filename, check filename and sandbox dir.
- Fixtures are named for their content, never for a scenario — they are shared
  (`retry-topic` serves all grill scenarios and the build-spec gate).
- Names recur as string literals inside checks (`diffSandbox`, `readTasks` calls) and
  in `reset-sandboxes.sh` MAPPINGS — a rename must sweep all of them.

## Assertions

- Deterministic ESM checks first. promptfoo requires the `.mjs` extension for ESM
  assert files (`export default (output) => GradingResult`); `package.json`
  `type: module` is not a supported route.
- Assert on artifacts on disk via `lib/helpers.mjs` (`diffSandbox`, `readTasks`,
  `readSandboxFile`), never on skill telemetry — `skill-used` /
  `metadata.skillCalls` stay empty for plugin skills.
- `llm-rubric` only for qualities determinism cannot capture, always through the
  `defaultTest` SDK grader. Keep its `append_system_prompt`: without the JSON-only
  pin the grader intermittently wraps verdicts in prose and promptfoo cannot parse.

## Fixtures and DEFECTS.md

- Every fixture's `DEFECTS.md` is its load-bearing contract: planted defects, sentinel
  strings, exact line numbers the asserts rely on. Read it BEFORE editing any fixture
  file; update it with any edit.
- Derived fixtures (`unvalidated-rollout-spec`, `orphan-rollout-spec`,
  `no-rollout-order`) are regenerated from their base fixture, never edited directly.
- `DEFECTS.md` never reaches a sandbox (the reset script excludes it) — asserts must
  not depend on it.

## Failure triage

Fix the fixture or the assert, never lower the bar. Distinguish three cases:

1. **Genuine skill regression** — the failure is the signal; report it, don't paper
   over it.
2. **Fixture legitimizing unwanted behavior** — fix the fixture wording (precedent:
   a soak-period sentence legitimized a 7th operational task against the frozen
   6-task assert).
3. **Harness false positive** — fix the assert, then validate the fix OFFLINE against
   the saved run artifacts before spending another live run: import the check with
   `node --input-type=module` and feed it the output from `latest.json` plus the
   leftover sandbox (precedent: an appended evidence note quoting the old stale
   citation tripped a whole-file regex; the check now scopes to the pre-append body).

## Budgets

`max_budget_usd` exhaustion is a hard SDK process exit (recorded as an error; asserts
never run), not a graceful stop. Never misread it as a regression — size the budget to
finish: 2.0 default; 5.0 for explore-heavy scenarios (validate/split groups) and for
grilling-length runs where `ask_user_question: first_option` auto-answers whole rounds.

## CI

The smoke group (one scenario per skill plus the command gate) runs on PRs touching
`plugins/fd3/**`. When adding or renaming scenarios, keep the filter pattern in
`.github/workflows/fd3-evals.yml` and the usage examples in `scripts/run-evals.sh`
in sync.

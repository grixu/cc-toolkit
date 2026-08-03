# fd3 eval suite — working rules

Rules for working inside `plugins/fd3/evals/`. All of them were earned the hard way;
follow them before improvising.

## Layout

Three configs: `promptfooconfig.yaml` (default suite, runs concurrently),
`promptfooconfig.e2e.yaml` (serial write→validate→split chain over one shared sandbox,
`evaluateOptions.maxConcurrency: 1`), `promptfooconfig.network.yaml` (researcher group;
needs `FIRECRAWL_API_KEY` and `CONTEXT7_API_KEY` in the environment). Slash-command
prompts live in `prompts/*.txt` (a `prompts:` entry starting with `/` parses as a file
path, hence the `{{query}}` + `file://` indirection). Assertions live in `lib/`;
pristine scenario inputs in `fixtures/`; `.sandbox/` and `.results/` are git-ignored
and regenerated.

## Running

- Always run via `scripts/run-evals.sh fd3 [pattern]` from the repo root — it resets
  every sandbox first and picks the config by pattern prefix: `e2e*` → serial config,
  `researcher*` → network config, anything else filters the default config.
- Never run the e2e chain with `--repeat`: the three steps share `.sandbox/e2e-chain`
  and depend on listed order.
- Scenarios take minutes each. Triage from `plugins/fd3/evals/.results/latest.json`
  (overwritten on every invocation) — never re-run just to read a result.

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

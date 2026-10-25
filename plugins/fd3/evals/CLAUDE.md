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
agent's structured result. A call with an `agentType` of `fd3:<name>` also gets the
`disallowedTools` of `agents/<name>.md`, merged into the provider's own
`disallowed_tools`: the CI runner runs as `fd3:ci-runner` without `ScheduleWakeup` or
`Monitor`, after a Haiku runner ended its turn on a wakeup mid-build despite a prompt
ban. An agent definition with a `tools` allowlist fails the scenario, since the provider
does not apply one. A model the script does not pin is the config's
`claude-opus-5-5`; the CI runner's `haiku` therefore shows as a model mismatch in the
summary, by design. The provider delegates to promptfoo's `anthropic:claude-agent-sdk`
provider (`loadApiProvider`), which keeps its cost, `modelUsage` and `toolCalls`
metadata — a YAML provider config cannot carry a run-time prompt or a hook callback.
Agent scenarios run with background tasks enabled (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=0`,
overriding the runner) because the workflow's agents have the Bash tool's `run_in_background`
(and every agent but the CI runner `Monitor`), and abandoning a backgrounded build is the
failure they test. The fixtures
put the task files outside the sandbox's git root and record the task branch's head in
`.sandbox/.origins/<scenario>/branch-head`, out of every agent's reach.

A skill scenario (`implement-consent-batch`) runs `/fd3:implement` headless from its
`prompts/` file, with the plugin loaded and `ask_user_question: first_option`. The
provider's PreToolUse hook on `Workflow` snapshots the task files into
`metadata.fd3.workflowCalls` and denies the call, so the run ends at its launch and the
check reads the files as the workflow's agents would have received them. The "first
batch" is every AskUserQuestion call made before the first Edit, Write or Workflow
call, read from the top-level `metadata.toolCalls`. Step 2 offers enabling code-review as
part of its review answer, and `first_option` took it on a live trial, writing the
operator's real user settings — the shared `Bash(claude plugin *)` deny rule (see
Isolation) now refuses it in every config.

The two `implement-fix-cr-*` scenarios render the review fixer the same way, after a
review whose scripted cr-merge result is the scenario's one `finding`. Their check reads
the fixer's `skipped` (the finding, by location) and `caveats` (the scenario's
`skipReason`), and diffs the worktree from the recorded branch head: any changed line
must match the scenario's `allowedLine` (none for the spec-bound one).

`implement-ci-waits-long-command` must hold every time: its intended gate is pass^3
(`scripts/run-evals.sh fd3 implement-ci --trials 3`). It sleeps 200 s by design.
None of the group is in the CI smoke filter.

## Isolation

Eval agents run with `bypassPermissions` on the operator's machine, so every target
provider and the SDK grader load `scripts/evals-isolation.json` as flag settings (`settings:`;
the SDK refuses a settings path together with its `sandbox` option, so the sandbox block
lives in the file). What it confines:

- **Bash (and Monitor) — OS sandbox** (Seatbelt on macOS, bubblewrap + socat on Linux).
  `failIfUnavailable` makes a run fail rather than run unsandboxed; `allowUnsandboxedCommands:
  false` ignores `dangerouslyDisableSandbox`. Writes: the working directory (each scenario's
  `.sandbox/<name>`) and the sandbox temp dir only (`$TMPDIR` = `/tmp/claude-<uid>` on macOS);
  `/tmp` itself and the home directory are read-only, and the CLI's config dir is write-protected.
  Unsandboxed runs of `grill-verified-claims` and `build-spec-post-verdict-change` wrote scratch
  files straight to `/tmp`; those writes now fail and the agent has to fall back to `$TMPDIR`.
  Reads: `credentials.files` denies `~/.config/gcloud`, `~/.aws`, `~/.kube`, `~/.docker`,
  `~/.ssh`, `~/.netrc`, `~/.npmrc`, `~/.git-credentials`, `~/.config/gh`, `~/.config/op`,
  `~/.ccs`, `~/.claude`, `~/.claude.json`; `credentials.envVars` unsets cloud, registry,
  GitHub, Anthropic and MCP tokens. Network: `strictAllowlist` with only the package registries,
  GitHub read hosts and vendor docs the grill research used (`registry.npmjs.org`,
  `registry.terraform.io`, `raw.githubusercontent.com`, `api.github.com`, `cloud.google.com` and
  `docs.cloud.google.com`, where it 301-redirects, for the BigQuery docs `grill-verified-claims` reads); any other host is refused, not prompted.
- **File tools — permission deny rules**, which hold under `bypassPermissions` (deny is
  evaluated before the mode). `Read(...)` denies on the same credential paths and on the CLI's
  settings and credential files under `~/.claude` and `~/.ccs` (a `Read` deny also blocks
  Edit/Write there), plus `Edit(~/.claude/**)` and `Edit(~/.ccs/**)`. The rest of those dirs
  stays readable to Read on purpose: the CLI persists oversized tool results under its config
  dir's `projects/`, and sandboxed Bash cannot reach them (an `allowRead` for that subtree does
  not re-open it inside the credentials deny), so the agent reads them back with Read — a run
  that greps such a file from Bash gets `Operation not permitted` and retries.
- **`claude plugin …` / `claude plugins …`** — a Bash deny rule.

Not confined: WebFetch and WebSearch (in-process; `allowedDomains` does not gate them), MCP
servers (in-process HTTP), the CLI's own API traffic and auth, hooks, and the rest of the
filesystem for reads. For code-review, whose `working_dir` is the repo root, the whole checkout
is writable. A live probe (Bash `wc` and Read of a gcloud config, `claude plugin list`, writes
into `~/.ccs`, `curl https://example.com`, a `dangerouslyDisableSandbox` retry) was denied at
every step while writes in the working directory succeeded.

## Running

- Always run via `scripts/run-evals.sh fd3 [pattern]` from the repo root — it resets
  every sandbox first and picks the config by pattern prefix: `e2e*` → serial config,
  `researcher*` → network config, `implement*` → implement config, anything else
  filters the default config.
- For variance, use `--trials <k>`: k sequential runs of the selected config, every
  sandbox reset before each trial. The runner rejects promptfoo's `--repeat` — its
  copies run concurrently in the one sandbox the run reset, and eight runs saw or
  deleted each other's writes. The same holds for `repeat` set in a config.
- A k-trial run exits with the first nonzero trial exit code. `--gate any` makes it succeed
  when every test passed at least one trial instead (pass@k); an errored result is not a
  pass, a trial that exported no JSON fails the gate, and a sandbox that could not arm
  still exits 3.
- The e2e chain under `--trials` stays safe: each trial replays write→validate→split
  serially (`maxConcurrency: 1`) from a fresh `.sandbox/e2e-chain`. Never run two
  invocations of the runner at once — they share `.sandbox/`, and the second one's
  reset wipes the first one's chain mid-run.
- For a model A/B, `--model <id>` exports `EVAL_TARGET_MODEL`, which every config's target
  model reads (`{{ env.EVAL_TARGET_MODEL | default("claude-opus-5-5") }}`); the grader stays
  pinned, and models the implement workflow script pins (the CI runner's haiku) keep theirs.
- Every run is archived in `.results/runs/<UTC>-<sha>[-dirty]/`: `trial-<i>.json`,
  `meta.json` (SHA, config, filter, configured target/grader model, `--model` override, tool versions)
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
- Grade facts from structured artifacts — frontmatter fields (`merge-after`,
  `branch-base`, `depends-on`), the report table, the question ledger — never from
  prose sentences. Where prose is unavoidable (a task `## Note`), match on
  `h.normalizeProse(text)` (wraps, hyphens and emphasis joined) and skip a match
  negated just before it; four rounds of wording fixes to one regex preceded this rule.
- The output is the run's final message only; earlier assistant messages are not
  exposed. A check's second argument carries
  `context.providerResponse.metadata.toolCalls` — every tool call, sub-agents' included,
  as `{ name, input, output, is_error }` — so read tool use and tool errors from there
  (`h.askedThroughTool`, `h.questionToolFailed`, `h.searchesFor`), and earlier state
  from files on disk.
- `llm-rubric` only for qualities determinism cannot capture, always through the
  `defaultTest` SDK grader, and one dimension per rubric — a rubric judging four facts
  fails without saying which. Keep its `append_system_prompt`: without the JSON-only
  pin the grader intermittently wraps verdicts in prose and promptfoo cannot parse.
- Where a run's files land is graded through git, not the file diff alone:
  `lib/checks/session-folder.mjs` (used by write-template-conformance) fails a run that leaves git
  anything to commit besides the spec and `evidence/`, or a `<spec>.session/` file git does not
  ignore. It needs a git root at the sandbox, so it guards only scenarios whose spec sits in one.
- Checks have model-free tests in `lib/checks.test.mjs` (run by the CI
  `workflow-scripts` job): `node --test 'plugins/fd3/evals/lib/*.test.mjs'`. A check
  fix lands with the real text it misjudged, anonymised under `lib/__fixtures__/`, and
  a text it must keep failing.

## Fixtures and DEFECTS.md

- Every fixture's `DEFECTS.md` is its load-bearing contract: planted defects, sentinel
  strings, exact line numbers the asserts rely on. Read it BEFORE editing any fixture
  file; update it with any edit.
- Derived fixtures (`unvalidated-rollout-spec`, `orphan-rollout-spec`,
  `no-rollout-order`, `deploy-path-payments-spec`, `ratified-rollout-spec`, `stale-origin-rollout-spec`) are regenerated
  from their base fixture, never edited directly.
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
   citation tripped a whole-file regex; the check now scopes to the pre-append body),
   then add that text to `lib/checks.test.mjs`.

A capability eval guards a mode real runs still show although the rule against it exists
(`grill-verified-claims`): its failure is the expected signal, reported as a skill finding until
the skill closes it, never a reason to loosen the check.

A prompt that hands `/fd3:build-spec` a finished spec carries the reason beside the path, the
way a user types it. Without one, re-entry asks what brings the spec back, `first_option` picks
"a change to make" with no change attached, and the run stops waiting for it.

A pass deserves the same suspicion: a check that any numbered lines satisfied passed a
lookup update as a grilling round, and one that counted verdict lines passed a run whose
questions never reached the user.

## Budgets

`max_budget_usd` exhaustion is a hard SDK process exit (recorded as an error; asserts
never run), not a graceful stop. Never misread it as a regression — size the budget to
finish: 2.0 default; 5.0 for explore-heavy scenarios (validate/split groups) and for
grilling-length runs where `ask_user_question: first_option` auto-answers whole rounds.

## CI

The smoke group (one scenario per skill plus the command gate) runs on PRs touching
`plugins/fd3/**`, twice (`--trials 2 --gate any`): the job fails when any scenario passed
neither trial. Its `fd3-eval-results` artifact is the run dir (both `trial-<i>.json`,
`meta.json`, `summary.json`). When adding or renaming scenarios, keep the filter pattern in
`.github/workflows/fd3-evals.yml` and the usage examples in `scripts/run-evals.sh`
in sync.

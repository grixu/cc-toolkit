# code-review — promptfoo eval suite

Repeatable [promptfoo](https://www.promptfoo.dev/) evals for the `comment-review`
skill. Each test runs the **real skill** (loaded as a local plugin through the
Claude Agent SDK) against a fixture and grades the comment-quality verdicts
(KEEP / REMOVE / REWRITE / MOVE, rules R1–R12).

This is dev tooling — it is **not** shipped as part of the plugin runtime.

## Layout

```
evals/
  promptfooconfig.yaml   # provider + tests + assertions
  prompts/review.txt     # natural-language trigger for the skill
  fixtures/              # inputs (2 ported from skill-creator + 4 reconstructed)
```

Node dev deps (`@anthropic-ai/claude-agent-sdk` + `promptfoo`) and the run
scripts live at the **repo root** (`package.json`, single shared `node_modules`),
not per-plugin.

| Test | Fixture(s) | Focus |
|------|-----------|-------|
| eval-0 | `datadog-integration.tf` | R5 banners + R4 internal-doc refs vs external RFC |
| eval-1 | `scheduler.ts` | R4 file/doc refs, R5 banners, R1 narration, kept diagram/CVE |
| eval-2 | `dlq-codes.ts` + `dlq.handler.ts` | R12 misplaced/duplicated rationale (REMOVE vs MOVE) |
| eval-3 | `payment-validator.ts` | R4 spec-id pointers (REMOVE/REWRITE), token-stripping |
| eval-4 | `host-allowlist.ts` | R4 spec-ids embedded mid-sentence → REWRITE, keep the WHY |

## Prerequisites

- `pnpm install` at the **repo root** (installs `@anthropic-ai/claude-agent-sdk` +
  `promptfoo` into the shared root `node_modules`).
- A logged-in Claude Code CLI. The target provider runs on your **subscription**
  (`apiKeyRequired: false`) — no `ANTHROPIC_API_KEY` needed.

## Run

All commands run from the **repo root** (so the Agent SDK resolves from the root
`node_modules`):

```bash
pnpm install

# this suite (full)
pnpm eval:code-review

# every plugin's eval suite (plugins/*/evals/*)
pnpm eval

# forward args to promptfoo, e.g. focus one test while iterating
pnpm eval -- --filter-pattern eval-3

# structural check (free)
./node_modules/.bin/promptfoo validate config -c plugins/code-review/evals/promptfooconfig.yaml

# browse results
./node_modules/.bin/promptfoo view
```

`scripts/run-evals.sh` (wired to `pnpm eval`) discovers every
`plugins/<name>/evals/promptfooconfig.yaml`, runs each, and writes
`/tmp/eval-<name>.json`.

## Notes & knobs

- **Model.** Default target/grader is `claude-sonnet-4-6` (cheap iteration); set a
  stronger target in `promptfooconfig.yaml` (`providers[0].config.model`) for a
  regression gate. Baseline: **sonnet 41/42, opus 42/42.** Two assertions are
  instructive:
  - *eval-3 `§4.1`* is a genuine judgment boundary — after the spec-id is stripped
    the comment borders on R1, so REWRITE and REMOVE are both defensible (opus and
    sonnet often pick REMOVE). The assertion accepts **either**; only "kept as-is" fails.
  - *eval-4 token-verification* is a real capability discriminator: it asks the
    report to verify each token against the code before stripping. Sonnet takes a
    "letter+number ⇒ spec-id" shortcut and **fails** it; opus shows the check and
    **passes**. Kept strict on purpose as a model marker.
- **Flaky verdicts.** A borderline verdict can flip run-to-run; add `repeat: 2`/`3`
  (or `defaultTest.options`) if you want a stable gate.
- **Grader.** llm-rubric grades on the subscription via a single-turn agent
  (slow-ish). For a faster/cheaper grader, set `ANTHROPIC_API_KEY` and change
  `defaultTest.options.provider` to `anthropic:messages:claude-opus-4-8`.
- **No `skill-used` assertion.** Plugin skills load via Agent-Skills *injection*,
  not a `Skill()` tool call, so `metadata.skillCalls` stays empty. Each test
  instead asserts (via `regex`) that the report uses the skill's R1–R12 taxonomy —
  output of that shape requires the skill to have loaded (you can confirm in the
  trace: the agent reads `skills/comment-review/references/rules.md`).
- `setting_sources: []` keeps this repo's `CLAUDE.md`/hooks out of the run, so
  results reflect the skill, not the surrounding harness.

## Provenance

Fixtures `payment-validator.ts` and `host-allowlist.ts` and their assertions come
from the skill-creator workspace
(`../skills/comment-review-workspace/`, evals 3 & 4). Fixtures
`datadog-integration.tf`, `scheduler.ts`, `dlq-codes.ts`, `dlq.handler.ts` were
reconstructed from the assertion lists in that workspace's
`skill-snapshot/evals/evals.json` (evals 0/1/2), whose original fixtures were no
longer present.

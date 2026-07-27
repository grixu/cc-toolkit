# code-review — promptfoo eval suite

Repeatable [promptfoo](https://www.promptfoo.dev/) evals for the `comment-review`
and `quality-review` skills. Each test runs the **real skill** (loaded as a local
plugin through the Claude Agent SDK) against a fixture and grades its output —
comment verdicts (KEEP / REMOVE / REWRITE / MOVE / ADD, rules R1–R12) on the
comment track, and findings tagged `family` · rule · severity on the quality track.

This is dev tooling — it is **not** shipped as part of the plugin runtime.

## Layout

```
evals/
  promptfooconfig.yaml   # provider + tests + assertions (both tracks)
  prompts/review.txt     # natural-language trigger — comment track
  prompts/quality.txt    # natural-language trigger — quality track
  fixtures/              # inputs (2 ported from skill-creator, 4 reconstructed, 3 for quality)
```

Node dev deps (`@anthropic-ai/claude-agent-sdk` + `promptfoo`) and the run
scripts live at the **repo root** (`package.json`, single shared `node_modules`),
not per-plugin.

Each test binds to one prompt via `prompts: [comment-track]` / `[quality-track]`,
so the two tracks don't cross-run (promptfoo otherwise matrices every test against
every prompt).

| Test | Fixture(s) | Focus |
|------|-----------|-------|
| eval-0 | `datadog-integration.tf` | R5 banners + R4 internal-doc refs vs external RFC |
| eval-1 | `scheduler.ts` | R4 file/doc refs, R5 banners, R1 narration, kept diagram/CVE |
| eval-2 | `dlq-codes.ts` + `dlq.handler.ts` | R12 misplaced/duplicated rationale (REMOVE vs MOVE) |
| eval-3 | `payment-validator.ts` | R4 spec-id pointers (REMOVE/REWRITE), token-stripping |
| eval-4 | `host-allowlist.ts` | R4 spec-ids embedded mid-sentence → REWRITE, keep the WHY |
| eval-5 | `quality-vocabulary.ts` | severity verbatim from the table, repeats collapsed, headline honesty |
| eval-6 | `quality-recall.ts` | recall gate — a seeded high + medium + nit across three families must all surface |
| eval-7 | `quality-calibration.ts` | noise gate — five documented look-alikes must stay non-findings |

**eval-6 and eval-7 are the two halves of one gate.** eval-6 fails when the review
under-reports; eval-7 fails when it compensates by flagging look-alikes. A prompt
change that moves one number must be checked against the other.

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
  regression gate. `claude-opus-5` works as a target and logs a harmless "Using unknown
  model for Claude Agent SDK" warning.

- **Measured scores** (assertion-level; promptfoo's headline count is test-level and
  fails a whole test on one assertion). Measured 2026-07-26:

  | run | comment track | quality track |
  |-----|---------------|---------------|
  | before the Opus 5 prompt pass, sonnet-4-6 | 36/42 (3/5 tests) | — (track did not exist) |
  | before the Opus 5 prompt pass, opus-5 | 40/42 (4/5 tests) | — |
  | after, sonnet-4-6 | **42/42 (5/5)** | 17/20 |
  | after, opus-5 | not re-measured | 16/20 |

  An earlier note in this file recorded "sonnet 41/42, opus 42/42"; neither number
  reproduced on re-measurement, so treat the table above as the reference. The two
  opus-5 misses were both in eval-0 — one banner never enumerated, and a rewrite that
  dropped the WHY it was supposed to keep. Both are fixed on the comment track's
  post-pass run.

- **eval-5 is flaky; eval-6 and eval-7 are not.** Across five post-pass runs, eval-6
  (recall) scored 5/5 and eval-7 (calibration) 7/7 on **both** models, every time.
  eval-5 ranged **4/8 to 7/8** with no stable model split — opus-5 produced a
  textbook-perfect skeleton in one run and a prose summary in the next, from an
  identical config. What moves is only the report *chrome*: the `Conventions` /
  `Headline` lines and the file-path `###` headers. The findings themselves — families,
  rules, severities — are correct in every run.

  So treat eval-5's skeleton assertions as **indicative, not a pass/fail gate**, unless
  you add `repeat: 3` and compare rates. Skeleton adherence in `quality-review` is a
  known open weakness: the Opus 5 prompt pass removed fenced code blocks from the report
  reliably, but did not make the header/preamble structure deterministic.

- Two assertions are instructive:
  - *eval-3 `§4.1`* is a genuine judgment boundary — after the spec-id is stripped
    the comment borders on R1, so REWRITE and REMOVE are both defensible (opus and
    sonnet often pick REMOVE). The assertion accepts **either**; only "kept as-is" fails.
  - *eval-4 token-verification* asks the report to verify each token against the code
    before stripping it. It used to be a model discriminator — sonnet took a
    "letter+number ⇒ spec-id" shortcut and failed while opus passed — but after the
    Opus 5 prompt pass sonnet passes it too. Kept strict: it now guards the behaviour
    rather than marking the model.
- **Flaky verdicts.** A borderline verdict can flip run-to-run; add `repeat: 2`/`3`
  (or `defaultTest.options`) if you want a stable gate.
- **Grader.** llm-rubric grades on the subscription via a single-turn agent
  (slow-ish). For a faster/cheaper grader, set `ANTHROPIC_API_KEY` and change
  `defaultTest.options.provider` to `anthropic:messages:claude-opus-4-8`.
- **No `skill-used` assertion.** Plugin skills load via Agent-Skills *injection*,
  not a `Skill()` tool call, so `metadata.skillCalls` stays empty. Each test
  instead asserts (via `regex`) that the report uses the skill's own taxonomy —
  R1–R12 on the comment track, the backticked family labels on the quality track —
  since output of that shape requires the skill to have loaded. You can confirm in the
  trace: the agent reads `references/rules/<lens>.md`. eval-7 is the exception: a
  deliberately clean fixture may produce no family tag at all, so it proxies on the
  `Tally` line instead.
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

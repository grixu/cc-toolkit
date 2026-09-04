# code-review — promptfoo eval suite

Repeatable [promptfoo](https://www.promptfoo.dev/) evals for the `comment-review`
and `quality-review` skills and for the three scanner-only lenses (`security`,
`performance`, `spec`). Each test runs the **real plugin** (loaded as a local plugin
through the Claude Agent SDK) against a fixture and grades its output — comment
verdicts (KEEP / REMOVE / REWRITE / MOVE / ADD, rules R1–R12) on the comment track,
and findings tagged `family` · rule · severity on the quality, scanner, and standards
tracks.

This is dev tooling — it is **not** shipped as part of the plugin runtime.

## Layout

```
evals/
  promptfooconfig.yaml     # provider + tests + assertions (all tracks)
  prompts/review.txt       # natural-language trigger — comment track
  prompts/quality.txt      # natural-language trigger — quality track
  prompts/security.txt     # scanner brief — security lens
  prompts/performance.txt  # scanner brief — performance lens
  prompts/spec.txt         # scanner brief — spec lens ({{spec}} carries the spec path)
  prompts/standards.txt    # quality trigger with the standards fixture dir as repo root
  fixtures/                # inputs; fixtures/spec/ and fixtures/standards/ are multi-file
```

Node dev deps (`@anthropic-ai/claude-agent-sdk` + `promptfoo`) and the run
scripts live at the **repo root** (`package.json`, single shared `node_modules`),
not per-plugin.

Each test binds to one prompt label (`comment-track`, `quality-track`,
`security-track`, `performance-track`, `spec-track`, `standards-track`), so the
tracks don't cross-run (promptfoo otherwise matrices every test against every prompt).

| Test | Track | Fixture(s) | Focus |
|------|-------|-----------|-------|
| eval-0 | comment | `datadog-integration.tf` | R5 banners + R4 internal-doc refs vs external RFC |
| eval-1 | comment | `scheduler.ts` | R4 file/doc refs, R5 banners, R1 narration, kept diagram/CVE |
| eval-2 | comment | `dlq-codes.ts` + `dlq.handler.ts` | R12 misplaced/duplicated rationale (REMOVE vs MOVE) |
| eval-3 | comment | `payment-validator.ts` | R4 spec-id pointers (REMOVE/REWRITE), token-stripping |
| eval-4 | comment | `host-allowlist.ts` | R4 spec-ids embedded mid-sentence → REWRITE, keep the WHY |
| eval-5 | quality | `quality-vocabulary.ts` | severity verbatim from the table, repeats collapsed, headline honesty |
| eval-6 | quality | `quality-recall.ts` | recall gate — a seeded high + medium + nit across three families must all surface |
| eval-7 | quality | `quality-calibration.ts` | noise gate — five documented look-alikes must stay non-findings |
| eval-8 | quality | `quality-recall-2.ts` + `quality-recall-2.model.ts` | folded rules recall — `pass-through`, `canonical-helper` (cross-file), `feature-envy`, `message-chain` |
| eval-9 | quality | `quality-calibration-2.ts` + `quality-calibration-2.types.ts` | folded rules noise — DTO mapper, fluent builder, adapting facade, type-only import cycle, `(req, res)` |
| eval-10 | security | `security-recall.ts` | `secret-in-source`, `injection-sink` (source + sink lines), `insecure-setting`; no `nit` |
| eval-11 | security | `security-calibration.ts` | `knex.raw('?', [x])`, `spawn` argv, `sk_test_`, env read, health endpoint stay non-findings |
| eval-12 | performance | `performance-recall.ts` | `n-plus-one` with all four evidence items, `unbounded-fetch`; no "could be slow" |
| eval-13 | performance | `performance-calibration.ts` | enum loop, `take`/`skip` page, module-level `readFileSync` stay non-findings |
| eval-14 | spec | `spec/feature-spec.md` + `spec/feature-impl.ts` | one MISSING (under the spec path), one WRONG, one scope-creep, "3 of 5 requirements met" |
| eval-15 | standards | `standards/CODING_STANDARDS*.md` + `standards/service.ts` | MUST → high with quoted rule, `.local`-relaxed SHOULD suppressed, MAY → nit, vague prose ignored |

**eval-6 and eval-7 are the two halves of one gate.** eval-6 fails when the review
under-reports; eval-7 fails when it compensates by flagging look-alikes. A prompt
change that moves one number must be checked against the other. eval-8/eval-9 are the
same pair for the folded `module`/`objects` rules; eval-10/11 and eval-12/13 for the
security and performance lenses.

### Scanner track

`security`, `performance`, and `spec` exist only inside `/start-cr` — they have no
standalone skill to trigger by description, and the Agent SDK rejects a prompt that
starts with `/`, so `/start-cr` itself cannot be invoked from a promptfoo prompt. The
three scanner prompts therefore **emulate the orchestrator's Scanner brief** in
natural language: act as the `<lens>` scanner, read `references/rules/<lens>.md` and
`references/severity.md` completely, review the file in path mode, return findings
only in the brief's exact bullet shape, write nothing. What they measure is the rules
file plus the brief contract; the dispatch/merge mechanics of `start-cr.md` are out of
reach here. The prompts avoid the `quality-review`/`comment-review` trigger words so
those skills do not fire on top of the brief.

The standards test rides the quality track (`standards.txt` opens with the
`quality review` trigger) and tells the skill to treat `fixtures/standards/` as the
repository root for the `CODING_STANDARDS.md` + `.local.md` pair.

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

  **Measured 2026-09-02** (sonnet-4-6 target and grader, SDK 0.3.252, plugin path and
  named-skill prompt fixed as described below; one run each, assertion-level):

  | test | score | note |
  |------|-------|------|
  | eval-6 | 5/5 | gate unchanged |
  | eval-7 | 7/7 | gate unchanged |
  | eval-8 | 6/6 | first run 5/6 — all four folded rules surfaced, the miss was rubric wording (it named `priorityOf`, the report put `feature-envy` on `totalOf`); rubric loosened and re-measured at 6/6 |
  | eval-9 | 7/7 | after removing two self-inflicted highs from the fixture (a grab-bag module → one cohesive controller; a redundant `.limit()`) |
  | eval-10 | 6/6 | |
  | eval-11 | 7/7 | |
  | eval-12 | 7/7 | |
  | eval-13 | 6/6 | |
  | eval-14 | 7/7 | after tightening spec line 5 to "called with an empty list" — the scanner read "no orders to export" as post-filter and raised a defensible `partial-requirement` |
  | eval-15 | 6/6 | |

  Per-test cost on the quality track is now ~$0.40–0.55 (the skill reads six reference
  files and Greps one hop); the scanner track is ~$0.10–0.19. The comment track
  (eval-0…4) was not re-measured on this date.

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
- **Plugin path and skill trigger (SDK 0.3.252 / promptfoo 0.122.2, 2026-09-02).**
  Two things changed under a fresh `pnpm install` and both silently zeroed the quality
  track (the model answered from general knowledge — "patterns / duplication",
  severity "Low" — with no rules file read):
  - `plugins[].path` resolves relative to **this config file**, not `working_dir`;
    `plugins/code-review` loaded nothing, `..` loads the plugin. Verified with a
    one-turn "list your skills" probe.
  - Plugin skills now surface through the **`Skill` tool** (`metadata.skillCalls` is
    populated), and the bare `quality review <path>` opener no longer makes the model
    invoke one. The quality/standards prompts therefore name the skill
    (`Use the \`code-review:quality-review\` skill …`) and say **report only — no apply
    menu, no `AskUserQuestion`**; without that line the skill's Step 6 menu fires,
    `ask_user_question: first_option` picks "Safe fixes", and the final message (the
    only thing promptfoo grades) becomes "I have no Edit tool" instead of the report.
    `prompts/review.txt` (comment track) still uses the old opener and was **not**
    re-measured under this SDK — expect it to need the same treatment.
- **`skill-used` is still not asserted.** Each test asserts (via `regex`) that the
  report uses the skill's own taxonomy — R1–R12 on the comment track, the backticked
  family labels on the quality/scanner tracks — since output of that shape requires
  the rules to have been read. eval-7/9 (clean quality fixtures) proxy on the `Tally`
  line, eval-11/13 (clean scanner fixtures) on the `Not flagged` line the brief asks
  for.
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

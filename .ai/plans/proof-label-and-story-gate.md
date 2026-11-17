# Proof label and a decision-model gate for code story

Two changes to `dev-kit:pr-open`:

- a `proof` label on PRs whose proof is current;
- a `code_story` setting (`auto | always | never`), where `auto` asks Jev or Gemini whether the change is worth a
  story.

The gate's questions get calibrated on the owner's own PRs before anything is wired.

## Decisions taken

- One label, `proof`, with no proof kind. It goes on when the manifest has at least one rendered entry and none of
  them is stale or has rewritten history. It comes off on every refresh where that no longer holds. (Owner confirmed
  stale handling, 2026-11-17.)
- The owner approved sending the cohort's diffs (vuestorefront, bizwave-ai, grixu) to TypeSafe and Gemini.
- `code_story` lives in dev-kit, because `pr-open` owns the dispatch.
- The gate is a new `story_signals` tool in the dev-kit mod. It asks its own fact questions about how large the
  change is and what it touches, not the `pr_risk` questions. It uses the existing Jev and Gemini providers, with its
  own `story_gate_backend` option (`auto | typesafe | gemini | both`) rather than `decision_backend`, because
  `pr-open` calls it mid-run and cannot stop to ask which backend to use (owner, 2026-11-17).
- Errors fail open: no key, a tool error or uncertainty means the story is generated, and the report says why.
- An existing PR that already links a story always gets the story updated.
- The `CODE_STORY` result line does not change, because a skipped story never starts its subagent.

## Phase 1: calibration (dev tooling, not wired)

Modelled on `plugins/code-review/evals/apply-decision/`. The data is private and lives in the ignored
`plugins/dev-kit/evals/story-gate/local/`.

- [x] **Cohort.** _(Done: 24 PRs with a story, not 26 — two hits only mentioned it — plus 13 without, 37 in all.)_ Use the 26 owner PRs with a `## Code story` section (2026-10-29 … 2026-11-17, across grixu/*,
  bizwave-ai/* and vuestorefront/console-monorepo). Add 6–8 owner PRs from the same period that have no story, chosen
  for spread: plugin-enable chores, test-only, a one-line fix, an infra value change. That gives about 32 cases.
  Write `local/cohort.jsonl` with repo, number, base, head SHA and size.
- [x] **Labels.** _(Owner confirmed all 37 on 2026-11-17: 17 story, 20 skip. v2 added self_explanatory, follows_existing_pattern, mostly_removal and non_obvious_cause; none separated the labels. A rule on line count and file kind matched the model gate; owner to choose.)_ Pre-fill `local/labels.jsonl` with `story | skip | borderline` and a one-line reason per PR. The
  owner corrects it. Owner labels are the reference, and pre-filled labels never count until the owner confirms them.
- [x] **Questions.** _(Added `docs_only` as a sixth fact. Diffs over 4 requests skip the model and get a story.)_ Write `hooks/story.ts` in dev-kit with the fact questions (binary, phrased like
  `pr-proof/hooks/signals.ts`) and the state builder:
  - `cosmetic_only`: typos, wording, formatting, comments;
  - `tests_only`;
  - `localized_fix`: confined to one function or a few lines;
  - `config_value_change`: values in config, CI or infra, with no new resources;
  - `new_or_restructured_flow`: a new module or flow, or a change in how components interact.

  The state is the diffstat plus the code diff, with lockfiles and generated files excluded, as the production tool
  will send it, so training and serving stay in parity.
- [x] **Extract.** _(Uses a bare clone and the tool's own git commands (`-U1`), not `gh pr diff`, to keep parity.)_ `extract.mjs` fetches each PR's diff (`gh pr diff`) and builds the states into
  `local/states.jsonl`.
- [x] **Run.** _(v1: 37/37 answered on both backends.)_ `run.mjs --backend typesafe|gemini --tag <t>` writes the answers to
  `evals/.results/story-gate/<t>/answers.<backend>.jsonl`. Keys come through `zsh -lic`.
- [x] **Metrics.** _(v1 numbers are provisional until the labels are confirmed.)_ `metrics.mjs` derives per-backend thresholds that maximise the skip rate with zero `story` cases
  skipped, and reports a leave-one-out estimate, the per-question AUC and every miss by name. `borderline` cases
  never count as wrong. With about 32 cases the estimate is rough, so the report says so.
- [x] **Localise misfits.** _(11 owner/gate disagreements: 4 wording, 2 missing context, 5 true facts that did not
  map to the label. The PR body was the missing input in 7 of 11.)_
- [x] **Experiments.** _(Log below; E3a with Jev + Gemini averaged wins.)_
- [x] **Holdout.** _(17 of 24 labelled; 7 left unlabelled and excluded. Both backends, frozen 0.8 / 0.9: 7/12 skips,
  0/5 story PRs skipped, identical over 3 Jev runs.)_ The E3 questions were written after reading these 37 cases, so
  the leave-one-out numbers are optimistic. Confirm once on ~20 fresh owner-labelled PRs that played no part in
  shaping the questions.
- [x] **Owner review.** _(Owner said yes 2026-11-17, with one change: the gate runs with either key, and the user
  picks Jev, Gemini or both.)_ Present the results: which questions separate the labels, the thresholds per backend,
  and the PRs that would be skipped. Drop questions that do not separate the labels. Wiring goes ahead only on the
  owner's yes.
- [x] `README.md` for the suite, plus tests for `hooks/story.ts` and `metrics.mjs` in `plugins/dev-kit/tests/`.
  _(`metrics.test.mjs` sits beside the script and runs with `node --test`, like pr-risk's; `metrics.mjs` now scores
  through production's `decide`, and the rejected margin option is gone. `data.mjs` keeps set `v1` in R2.)_

### Experiment log (dev set: 37 owner PRs, 17 story / 20 skip)

"LOO" is leave-one-out on thresholds: skip-labelled PRs skipped / story-labelled PRs wrongly skipped. Jev runs 3×.

| Exp | Change | Jev (avg of 3) | Jev single runs | Gemini | Decision |
|---|---|---|---|---|---|
| v2 | baseline questions, diff only | 6/20, 1 | — | 7/20, 2 | — |
| rule | ≤ 22 code lines, or docs/tests only, no model | 9/20, 1 (in-sample 11/20, 0) | — | — | reference |
| E0 | skip fact beats story fact by a margin | unchanged, fit picks no margin | — | unchanged | revert |
| E1 | flow fact excludes removals/text; wider `docs_only`; `agent_procedure_change` | 7/20, 1 | 7–8/20, 1 | 7/20, 1 | keep |
| E2a | + `intent` (title, body without generated sections, commits) | 10/20, 1 | 10/20, 1 | 0/20 (#4553 blocks every threshold) | keep |
| E2b | + function-context diff | 13/20, 1 | 12–13/20, 1 | 9/20, 2 | revert: 6 PRs go over budget, gain within noise of E3 |
| E3a | E2a + `behaviour_preserving`, `independent_small_edits`, `removes_working_mechanism`, `cause_outside_change` | **17/20, 0** | 15–17/20, 1 (cc-toolkit#49) | 14/20, 0 | keep |
| E3a both | Jev single run + Gemini, facts averaged | — | **16–17/20, 0** in all 3 | — | candidate |
| E4 both | E3a without `self_explanatory` and `non_obvious_cause` (dropped as chance-level before the holdout) | — | 16/20, 0 in all 3 | — | **frozen** |

Holdout (17 PRs, 12 skip / 5 story), thresholds frozen from dev, no fitting:

| Config | Skips | Story PRs skipped | Kept against the owner's skip |
|---|---|---|---|
| E3a both, 0.8 / 0.9 | 6/12 | 0/5 | homepage#9, homepage#17, agent-deck#7, marketing#20, vidya#37, console#4505 |
| E3a Jev alone, 0.75 / 0.85 | 4/12 | 0/5 | — |
| E3a Gemini alone, 0.825 / 0.9 | 6/12 | 0/5 | — |
| **E4 both, 0.8 / 0.9** | **7/12** | **0/5** | agent-deck#7, marketing#20, vidya#37, console#4498, console#4505 |

The owner then labelled the 7 remaining holdout PRs (6 story, 1 skip, `local/holdout2/`). E4 both at the same frozen
thresholds: 1/1 skip, 0/6 story PRs skipped, identical over 3 Jev runs. Whole holdout: **8/13 skips, 0/11 story
PRs skipped.**

Dev and holdout together: no story PR skipped in 28. Eleven holdout story cases still allow a miss rate up to ~25% at
95% confidence; the decision log in phase 2 is what tightens it.

Holdout thresholds, frozen before the holdout run: both averaged skipAt 0.8 / storyAt 0.9; Jev 0.75 / 0.85;
Gemini 0.825 / 0.9 (the last two fitted on E3a). No margin. The holdout is 17 owner-labelled PRs (12 skip, 5 story)
under `local/holdout/`.

The shipped single-backend thresholds are not those. When the owner asked for one-key use, Jev and Gemini were refitted
on the dev set's E4 answers alone (Jev 0.725 / 0.9, Gemini 0.775 / 0.9), after the pair's holdout result was known.
Scored once on the whole 24-PR holdout: Jev 7/13 skips in each of 3 runs, Gemini 10/13, both 0/11 story PRs skipped.
The holdout played no part in the fit, but these two rows are weaker evidence than the pair's.

Still kept against the owner's skip on dev: landings#8, agent-deck#6, homepage#16.

The gate needs the drafted description, so `pr-open` runs it after step 4 drafts the body, not at the start
(owner, 2026-11-17).

## Phase 2: wiring

- [x] `story_signals` tool in `plugins/dev-kit/hooks/register.ts`, built from `hooks/story.ts`. It takes the
  calibrated per-backend `THRESHOLDS` and appends each decision (no diff text) to
  `~/.cache/dev-kit/story-gate.jsonl` for later re-measurement. _(Registered with either key; with two backends and
  one failing, the other decides on its own thresholds.)_
- [x] `userConfig` `code_story`: `auto | always | never`. The default is `auto` only if phase 1 passes, otherwise
  `always`. _(`auto`; plus `story_gate_backend`: `auto | typesafe | gemini | both`.)_
- [x] `pr-open`:
  - read `code_story`;
  - with `auto`, call `story_signals` before step 6's dispatch instead of starting the story at once;
  - when the story is skipped, put one line with the reason in the report.
  _(The gate runs after step 4 drafts the body; an existing PR that keeps its body calls it at once, and one that
  links a story always updates it.)_
- [x] `pr-open` step 5: add or remove the `proof` label from the step 2 manifest result, the same way as the risk
  label, with `gh label create` on first use. Add a `proof_label` option (default on) and a `proof_label_name` option
  (default `proof`). _(Step 5.8; with no manifest the label is left alone.)_
- [x] dev-kit `README.md` settings table and `CHANGELOG.md` `[Unreleased]`.
- [x] `claude plugin test plugins/dev-kit`, and the `pr-open` eval cases touched by the step order.
  _(Plugin tests: 92 pass. Evals `pr-open-update-body` and `pr-open-proof`: 2/2 pass, one trial, with no decision
  key in the sandbox, so they cover the no-gate path and the proof label, not the gate's decision.)_
- [x] code-story `references/craft.md`: show the cause in unchanged lines, and a real caller before and after when the
  change makes code elsewhere redundant (owner, on console#4599).

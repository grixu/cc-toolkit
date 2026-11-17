# Code story gate evaluation

This suite calibrates `story_signals`, the tool `pr-open` asks whether a branch is worth a code story. The questions,
the state builder and the decision rule live in `hooks/story.ts`; the tool in `hooks/register.ts` and these scripts
both import them, so the eval sends the model exactly what production sends.

Run from the repository root with a Node version that strips TypeScript types:

```sh
node --test 'plugins/dev-kit/evals/story-gate/*.test.mjs'
node plugins/dev-kit/evals/story-gate/data.mjs pull v1
node plugins/dev-kit/evals/story-gate/extract.mjs --intent
node plugins/dev-kit/evals/story-gate/run.mjs --backend typesafe --data plugins/dev-kit/evals/story-gate/local/states.intent.jsonl --tag e4-ts-1
node plugins/dev-kit/evals/story-gate/run.mjs --backend gemini --data plugins/dev-kit/evals/story-gate/local/states.intent.jsonl --tag e4-gm
node plugins/dev-kit/evals/story-gate/metrics.mjs plugins/dev-kit/evals/.results/story-gate/e4-ts-1/answers.typesafe.jsonl plugins/dev-kit/evals/.results/story-gate/e4-gm/answers.gemini.jsonl
```

- `extract.mjs` builds one state per PR in `local/cohort.jsonl` (`--set holdout` for `local/holdout/`) from a bare
  clone, with the git commands the tool runs. `--intent` adds the PR title, its body without the generated
  **Code story**, **Proof** and **Risk** sections, and its commits, standing in for what `pr-open` has drafted when it
  calls the gate. `--function-context` widens every hunk to its function; it was tried and rejected (E2b below).
- `run.mjs` asks one backend every question for every state. It reads `TYPESAFE_API_KEY`, or
  `GEMINI_DECISIONS_API_KEY` / `GEMINI_API_KEY`, and writes `answers.<backend>.jsonl` and the questions it sent to the
  ignored `evals/.results/story-gate/<tag>/`.
- `metrics.mjs` averages the answer files it is given per PR, as the tool averages Jev and Gemini, then reports each
  question's AUC, fits the thresholds that skip the most `skip` PRs while skipping no `story` PR, and gives the
  leave-one-out estimate with every miss by name. `--labels` points it at another label file, and
  `--thresholds skipAt,storyAt` scores a holdout at frozen thresholds without fitting.

## The data

The PRs come from private repositories, so the data lives in the ignored `local/` folder and in Cloudflare R2, never
in git. `data.mjs` keeps set `v1` as two tarballs with their SHA-256: `local/` without the bare clones, and the
recorded answers of every experiment in `.results/story-gate/`. It needs the aws CLI and `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`; `push` runs on the owner's machine only.

- `local/cohort.jsonl` and `local/labels.jsonl`: the development set, 37 of the owner's PRs from 2026-10-29 to
  2026-11-17 across three organisations. 24 carry a published code story, 13 do not. The owner labelled every one
  `story` or `skip` (17 / 20); the label is whether the owner wants a story for that change, not whether it had one.
- `local/holdout/` and `local/holdout2/`: 24 later-picked owner PRs, labelled after the questions were frozen
  (11 story / 13 skip). Nothing was fitted to them.

## The metric

A skipped story the owner wanted costs more than a story nobody needed, so the gate has one hard limit: no PR labelled
`story` may be skipped. Within that limit it skips as many `skip` PRs as it can. A diff larger than four requests is
never sent and always gets a story. A skip question must hold in every part of a split diff; a story question needs
only one part.

## Results

Dev set, leave-one-out on the thresholds: skip-labelled PRs skipped out of 20, then story PRs wrongly skipped. Jev
runs three times because its answers vary; Gemini is deterministic.

| Exp | Change | Jev | Gemini | Decision |
|---|---|---|---|---|
| v2 | six skip questions, diff only | 6/20, 1 | 7/20, 2 | — |
| rule | ≤ 22 changed code lines, or docs or tests only, no model | 9/20, 1 | — | reference |
| E0 | a skip answer beats a story answer by a margin | unchanged | unchanged | reverted |
| E1 | the flow question excludes removals and text; wider `docs_only`; `agent_procedure_change` | 7/20, 1 | 7/20, 1 | kept |
| E2a | + the intent: title, body without generated sections, commits | 10/20, 1 | 0/20 | kept |
| E2b | + function-context diff | 13/20, 1 | 9/20, 2 | reverted: 6 PRs over budget |
| E3a | + `behaviour_preserving`, `independent_small_edits`, `removes_working_mechanism`, `cause_outside_change` | 15–17/20, 0–1 | 14/20, 0 | kept |
| E4 | E3a without two chance-level questions, Jev and Gemini averaged | 16/20, 0 in all 3 runs | | **frozen** |

Holdout, 24 PRs at the thresholds in `THRESHOLDS` (`hooks/story.ts`): both backends averaged skipped 8 of 13 skip
PRs, Jev alone 7 and Gemini alone 10, and none of them skipped any of the 11 story PRs. The three Jev runs gave the
same decisions. Only the pair's 0.8 / 0.9 was frozen before the holdout ran. The single-backend pairs (Jev 0.725 / 0.9,
Gemini 0.775 / 0.9) were fitted afterwards, on the dev set's E4 answers alone, when the owner asked for one-key use;
the holdout was not used to fit them, but its pair result was already known, so their holdout rows are weaker evidence
than the pair's.

What the experiments showed:

- **The PR's intent carried the gain.** In 7 of the 11 dev disagreements the reason for the owner's label sat in the
  PR body, not the diff: the change keeps behaviour, removes a cache for a measured reason, or syncs a file from
  another repository.
- **Asking whether a diff explains itself does not work.** `self_explanatory` and `non_obvious_cause` scored 0.42–0.62
  AUC and were dropped before the holdout.
- **Averaging both backends removes Jev's run-to-run misses** on the dev set; alone, a Jev run skipped
  cc-toolkit#49 once in three.

## Known biases

- **One owner, small sample.** Every label is one person's call. With 11 story PRs in the holdout, zero misses still
  allows a miss rate up to about 25% at 95% confidence. `~/.cache/dev-kit/story-gate.jsonl` logs every production
  decision without its diff, for re-measuring against later labels.
- **The intent is better than production's.** The eval reads the merged PR's final body and every commit; `pr-open`
  calls the gate with a freshly drafted body.
- **Questions written after reading the dev set.** Leave-one-out fits only thresholds, so the dev numbers are
  optimistic; only the holdout row says how the gate carries to new PRs.

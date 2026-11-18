# Apply decision evaluation

This suite measures whether a decision model can answer the structural walk's per-fix question for the owner. In
`/start-cr` that question is "apply this fix, skip it, or take another approach?". The model is Jev through
TypeSafe, or Gemini Decision. The questions and the context builder live in `hooks/apply-decision.ts`. The Jev and
Gemini adapters in `hooks/decision.ts` and `hooks/providers/` are byte-identical copies of the ones in dev-kit and
pr-proof.

The suite is dev tooling and is not wired into any command. Run it from the repository root with a Node version that
strips TypeScript types:

```sh
node --test plugins/code-review/tests/
node plugins/code-review/evals/apply-decision/run.mjs --backend typesafe --tag baseline
node plugins/code-review/evals/apply-decision/run.mjs --backend gemini --tag baseline
node plugins/code-review/evals/apply-decision/metrics.mjs plugins/code-review/evals/.results/apply-decision/baseline/answers.typesafe.jsonl
```

`run.mjs` reads the key from `TYPESAFE_API_KEY`, or for Gemini from `GEMINI_DECISIONS_API_KEY` or `GEMINI_API_KEY`.
It records one line per case, holding the answers, the model, the latency and the request body's SHA-256. Results go
to the ignored `evals/.results/apply-decision/<tag>/`. Its flags:

- `--limit` runs only the first N cases;
- `--concurrency` sets how many requests are in flight, 4 by default;
- `--all-types` adds the follow-up and design-choice lines;
- `--proposal walk` sends the walk's question text as the fix instead of the remedy from the report bullet. The walk
  text is what the owner answered, but production asks the model before that text exists, so `bullet` is the default.

## The data

The cases come from private repositories, so they live in the ignored `local/` directory and never in git:

- `local/decisions.code.jsonl`: one line per decision the owner made during an apply phase. Each line holds:
  - the finding's report bullet;
  - the fix exactly as it was proposed;
  - the question's options and the owner's answer;
  - a label: `apply`, `skip`, `alternative`, `conditional` or `clarify`;
  - the owner's reason, when they gave one;
  - the code the review saw.
- `local/runs/<id>.json`: the run the decision came from. It holds the rendered report and every `AskUserQuestion`
  with its answer.
- `local/extract/`: the scripts that rebuild both, and the brief the annotators followed.

`pnpm eval:data` keeps a copy in Cloudflare R2 as a tarball of `local/`, stored under its SHA-256, which
`eval-data.json` pins. It needs the aws CLI and the R2 keys, from the environment or from the git-ignored
`.r2-secrets.sh` that `bash scripts/r2-secrets-init.sh` writes from 1Password:

```sh
pnpm eval:data pull code-review/apply-decision   # restores local/
pnpm eval:data push code-review/apply-decision   # the owner's machine only; commit the new pin
```

How the set was built:

1. `extract2.mjs` walks the Claude Code transcripts that invoke `/code-review:start-cr`. It keeps each run's report and
   every question asked after it, and drops the asks that resumed sessions replay.
2. Subagents read each run against `annotate-brief.md`. For every per-fix question, and every option of a per-fix
   bundle, they wrote a line matched to its report bullet. A line is marked `confidence: low` where the match or the
   label was a guess.
3. `recover-code.mjs` restores the code the review saw from git. It takes the pull request's last commit before the
   run started; when the branch was rebased afterwards, it takes the oldest commit instead. Failing that, it takes the
   last commit before the run that holds the file, or the first one after it, and records which in `code.how`. It
   keeps 12 lines around the finding and the diff hunks that overlap them. `code.status: verified` means an identifier
   quoted in the bullet occurs near those lines. `mismatch` mostly means line drift, not the wrong file.
4. `changed-files.mjs` adds `code.changed_files`, the paths `git diff --name-only base sha` lists, for the 187
   decisions with a known base.

Collected 2026-11-16 from 52 runs between 2026-09-28 and 2026-11-16, with these counts:

| What | Count |
|---|---|
| Runs with a per-fix walk | 25 of 52 |
| Questions in the walk | 155, in 96 `AskUserQuestion` calls |
| Decisions | 214 |
| Fix cases scored (`walk` and `boy-scout` only) | 209 |
| Decisions with code recovered | 210, 150 of them with a diff hunk |

The 214 decisions are 191 `apply`, 10 `skip`, 7 `alternative`, 5 `clarify` and 1 `conditional`. Fixes inside the diff
were applied 180 times out of 196. Boy-scout fixes were applied 8 times out of 13.

## The metric

A case is positive when the owner applied the fix as proposed. Every other label needed the owner, so all of them
count as negatives. `walkDecision` returns `apply` or `ask` and never `skip`: 23 negatives are too few to set a skip
threshold. `metrics.mjs` reports these numbers against the "always apply" and "always ask" baselines:

- **Automation:** the share of fixes applied without asking.
- **Wrong auto-applies:** negatives the policy applied.
- **Negatives asked:** the share of negatives routed to the owner.
- **AUC:** how well the larger of the two gate probabilities separates apply from the rest.
- **Mean answers:** the mean of each answer, split by label.

It also tunes the thresholds for the most automation within a budget of wrong auto-applies (0, 1 and 2 by default),
once in-sample and once leave-one-run-out. Only the cross-validated row says how the thresholds would carry to new
runs. The confidence interval comes from a bootstrap that resamples whole runs.

## Results

Measured 2026-11-17 on all 209 cases, with no failed requests. Every version is scored with the current two-question
policy; automation and wrong auto-applies are leave-one-run-out at a budget of zero wrong; AUC is for the larger of the `needs_owner_facts` and `remedy_choice`
probabilities.

| Version | What changed | Gemini AUC | Gemini automation | Jev AUC | Jev automation |
|---|---|---|---|---|---|
| v1 (`baseline`) | five questions; the walk's question text as the fix; report headline in the input | 0.739 | 13.4%, 0 wrong | 0.777 | 4.8%, 3 wrong |
| v2 | the remedy from the report bullet as the fix; changed files added; headline and inert conventions dropped | 0.816 | 31.6%, 0 wrong | 0.781 | 35.4%, 2 wrong |
| v3 (current) | only `needs_owner_facts` and `remedy_choice` asked | 0.816 | 31.6%, 0 wrong | 0.782 | 36.4%, 2 wrong |

What the versions showed:

- **The input change carried the gain.** `needs_owner_facts` rose from 0.74 to 0.80 AUC on Gemini and from 0.80 to
  0.84 on Jev once the fix came from the report and the unrelated headline left.
- **Three questions did not separate the labels.** Asked whether the fix was valid, both models gave applied and
  declined fixes the same answer (AUC 0.55); the owner's declines were rarely about validity. `reach` stayed near
  0.55–0.60 even with the changed-file list, and `side_effects` near 0.59–0.66. Dropping them removed parameters
  without losing automation.
- **Gemini answers each question on its own and deterministically.** v2 and v3 sent different requests and got
  identical answers for the two kept questions.
- **The walk text helps.** With it, `remedy_choice` reaches 0.78 AUC on Gemini against 0.73: the walk's author often
  wrote the alternatives or the open question into it. Production cannot use it, since the model decides first.

`THRESHOLDS` hold each backend's zero-wrong pick on all 209 cases. On the same cases that is 31.6% automation for
Gemini (95% CI 23.4–40.4%) and 34.4% for Jev, both with no wrong auto-applies; only Gemini kept zero wrong out of
sample, so it is the backend to wire first.

## Known biases

- **One owner.** Every label is one person's call.
- **Framing.** The owner answered the walk's own wording of the fix, which usually led with the reviewer's
  recommendation. The labels measure agreement with that framing as much as with the fix.
- **Base rate.** Positives dominate, so "always apply" is right 89% of the time. A model is only useful if it catches
  the negatives at an automation rate worth having.
- **Coverage.** Fixes applied as a bucket (Safe fixes, a boy-scout batch) have no per-fix answer and are not in the
  set. Neither are fixes the owner asked for in chat.

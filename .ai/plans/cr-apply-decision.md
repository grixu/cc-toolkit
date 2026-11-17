# code-review: decision model for the structural walk

Goal: let a decision model (Jev, Gemini Decision) settle most of the `/start-cr` structural walk's
per-fix questions, so the owner is asked only where the model is unsure or the answer needs facts
the review does not hold.

## Evidence (private data in `plugins/code-review/evals/apply-decision/local/`, git-ignored)

- 52 `/start-cr` runs with questions, 2026-09-28 → 2026-11-16. Of the 40 apply menus, 36 offered the
  structural walk and 32 picked it.
- The walk: 96 `AskUserQuestion` calls carrying 155 questions in 25 runs (about 6 per run, up to 13).
- `decisions.jsonl`: 214 per-fix decisions, each paired with its report bullet (209 matched).
  Labels: 191 apply (89%), 10 skip, 7 alternative, 5 clarify, 1 conditional.
  - In-diff walk: 180 of 196 applied (92%).
  - Boy-scout: 8 of 13 applied; 5 skipped.
- So "always apply" is already 89% accurate. The model earns its keep only by catching the
  ~11% where the owner did not just say yes.
- What sits behind those cases:
  - facts outside the review: deployment state, a role model, what a deployed API sends;
  - a choice between remedies: a status code, the narrow versus the full dedup;
  - a fix that reaches untouched code or every call site;
  - a proposal too terse to judge, where the owner asked for clarification.

## Steps

- [x] Recover the code each decision saw from git (`local/extract/recover-code.mjs`): the PR's last commit
  before the run, else the nearest commit holding the file; 210 of 214 recovered, 150 with a diff hunk.
  Added at the user's request after approval.
- [x] Copy `decision.ts` and `providers/` from dev-kit into `plugins/code-review/hooks/`, byte-identical,
  and name all three copies in the shared header comment. Changed from "not in this plan": the user asked
  to reuse the existing Jev/Gemini code.
- [x] `plugins/code-review/hooks/apply-decision.ts` exports a pure, `$`-free module:
  - `APPLY_QUESTIONS`, in the internal decision format of `dev-kit/hooks/decision.ts`:
    - `owner_applies` (binary): the owner, shown this finding and fix, applies it as proposed;
    - `needs_owner_facts` (binary): the right answer depends on facts missing from the input, such as
      deployment or migration state, business and permission rules, an outside contract, or product intent;
    - `remedy_choice` (binary): more than one reasonable remedy exists, and the pick changes behaviour
      or a contract;
    - `reach` (scale): the fix's site / the same file / other files in the change / code outside the
      change (callers, untouched code, a published contract);
    - `behaviour_change` (scale): none / an edge case / ordinary behaviour.
  - `applyDecisionRequest(finding, change)` builds `{ input, questions }`:
    - from `finding`: the `cr-merge` line fields (severity, family, rule, path, lines, risk class,
      boy-scout), the report bullet, the exact proposed fix, and the site's code excerpt with its diff
      hunk, when given;
    - from `change`: the scope line, the headline, the conventions note, and the spec path and
      excerpt, when the change has a spec;
    - inputs are cut to a character budget.
  - `walkDecision(answers, thresholds)` returns `apply | ask`. Auto-skip is left out on purpose:
    the 23 negatives are too few to set a skip threshold.
- [x] `plugins/code-review/evals/apply-decision/`:
  - `README.md`: how the data was collected, the schema and its biases.
  - `cases.mjs`: turns `local/decisions.code.jsonl` and the run reports into cases.
  - `run.mjs`: sends each decision through `applyDecisionRequest` to `typesafe` or `gemini` by way of
    the copied providers, and records answers in `.results/`. Smoke-tested with a fake key only; no
    live run yet.
  - `metrics.mjs`: reports the automation rate, wrong auto-applies (a non-apply label decided
    `apply`) and the recall of non-apply cases routed to `ask`, with a bootstrap clustered by run,
    against the "always apply" and "always ask" baselines.
- [x] Re-annotation script (`local/extract/`) stays local; the README says how to regenerate it
  from transcripts.
- [x] Tests: `node --test plugins/code-review/tests/` covers the context builder (budget, missing
  fields) and the policy. Not `claude plugin test`: it requires a `hooks/hooks.json`, which would
  load a mod in every installed copy.
- [x] Live run on Jev and Gemini, then tune `DEFAULT_THRESHOLDS` from the leave-one-run-out result.
  Gemini at zero wrong (AUC 0.724, 15.8% automation in-sample, 16.3% with 1 wrong out-of-sample);
  Jev is weaker (AUC 0.688). Results in the suite README.
- [x] `data.mjs` pushes and pulls `local/` to R2, after the pr-risk script. Added at the user's request;
  the push itself needs the R2 variables, which only the secrets file holds.

- [x] v2/v3 after the context and question review: the fix comes from the report bullet's remedy (as in
  production), changed files added, headline and inert conventions dropped; only `needs_owner_facts` and
  `remedy_choice` kept, with per-backend thresholds. Gemini leave-one-run-out: 31.6% automation, 0 wrong
  (v1: 13.4%). `alternatives` was not added: reports do not state alternatives as a separate field.

Not in this plan: wiring the decision into `start-cr` / fd3 (a mod tool, `userConfig` backend
choice).

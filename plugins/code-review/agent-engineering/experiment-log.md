# code-review — experiment log

Append-only. One entry per behaviour-changing change (prompt, tools, retrieval, model, code
in the agent loop). Record failures too — they stop the team repeating them.

The real-PR A/B harness lives in the git-ignored `evals/local/coherence-sweep-ab/`
(`run-matrix.sh`, `blind.sh`, `aggregate.sh`, ground truth in `gt-resolved.json`). Dev set:
PRs 4472, 4598, 4183, 4276, 4427, 4511 of console-monorepo, read while the rules were written.

<!-- template:
## YYYY-MM-DD — <short title>
- Change:
- Hypothesis: (which failure mode, why this should help)
- Eval: <suite/command>, dataset <name@version>
- Result: <metric before → after>, regressions: <none / list>
- Cost/latency impact:
- Decision: keep / revert / iterate
-->

## 2026-11-26 — Coherence sweeps from code to prose (b3e433ae)
- Change: `coherence.md` sweep over both diff sides and changed formats, count and exclusive
  claims checked against the whole set, outcome checks, clearances cite `path:L`, no
  "pre-existing prose" skip, blocked search reported; `spec.md` stale-spec; merge keeps caused
  doc-drift primary.
- Hypothesis: 9 coherence-era misses from the 85-run error analysis come from shallow
  clearances, `+`-only identifier lists and merge demotion; the sweep moves recall on them.
- Eval: real-PR A/B, dev set above, 11 scored GT items, Opus 5.5, k=4, blind judge per PR.
  Run 1 (mixed Opus/Sonnet, k=2) discarded as confounded.
- Result: recall 24/44 → 29/44; paired 5 candidate-only vs 0 baseline-only (sign test
  p≈0.06); GT hits reaching the report 22 → 29. Reported-extras precision 97% → 94%. Gain
  only on 4427 (counts) and 4472 gt3 (inventory). gt0, gt1, gt2 0/8 in both variants.
  Regression: dev-only seeder flagged as breaking `usage-evaluation.mdx:L87` on 4511, 4/4
  candidate runs, 2 as primary.
- Cost/latency impact: scans $47 → $57 (+21%), p50 155 s → 172 s.
- Decision: keep, iterate — fix the seeder regression, then gt0/gt1, then confirm on held-out.

## 2026-11-26 — Exclusive claims scoped to the context they speak about
- Change: one sentence in `coherence.md` doc-drift count/exclusive bullet — a dev-only
  seeder, test, fixture or one-off script does not break a claim about the running system
  unless the sentence is about that context.
- Hypothesis: the 4511 false positive (`usage-evaluation.mdx:L87` vs dev seeder
  `local-dev-init.service.ts:L554`) comes from "check every call site" with no scope; scoping
  removes it (4/4 → ≤1/4) while the same-line real drift "namespace never reused" stays 4/4.
- Eval: real-PR A/B, 4511 only, variant `s1` vs run-2 candidate, Opus 5.5, k=4.
- Result: seeder false positive 4/4 → 0/4 (every run clears L87's write claim citing the
  running create/rename/delete paths; t4 names the seeder as dev-only). Bonus "never reused"
  found 4/4 → 4/4, reaching the report as primary 2/4 → 3/4. Invalid findings reaching the
  report 3 → 0; valid reaching the report 2 → 4 (one new real drift, `usage-evaluation.mdx:L61`).
  New invalid candidates (6) all stayed in Not flagged. Judge: `judge/4511-s1.json`, not
  blind (single variant), precedent `judge/4511.json`.
- Cost/latency impact: $1.83 → $1.83 per run, p50 ≈ 153 s.
- Decision: keep.

## 2026-11-26 — Enumerated clearances for quantified and outcome claims
- Change: `coherence.md` "A clearance cites the code too" — clearing a count, exclusive or
  outcome claim lists the Grep and every member checked (every write of the stated value for
  an outcome); one listed site makes it a `CANDIDATE`.
- Hypothesis: gt0 (4472 "never fetches", second fetch path unchecked) and gt1 (4598 pool set
  to 0 outside the function the doc names) are 0/8 because the clearance stops at the first
  matching site although the rule already says "Grep every call site"; making the
  enumeration part of the output moves both from 0/4 to ≥2/4, with 4472 gt3 and 4598
  extras' precision not worse.
- Eval: real-PR A/B, 4472 and 4598, variant `s2` vs run-2 candidate, Opus 5.5, k=4. Judges
  `judge/4472-s2.json`, `judge/4598-s2.json` (not blind, precedent = run-2 judge files).
- Result: gt0 0/4 → 1/4 (report-only), gt1 0/4 → 0/4, 4472 gt3 2/4 → 1/4; GT total 2 → 2.
  Valid extras reaching the report 16 → 16, invalid 0 → 0. Clearances do list sites now,
  but on gt0 three runs still listed only `flags.service.ts:L46` for "never fetches", and on
  gt1 every run enumerated `convergeFrozenState` and stopped.
- Cost/latency impact: $25.65 → $22.25 for the 8 runs; p50 ≈ 216 s vs 203 s.
- Decision: revert — the target did not move beyond noise. gt0/gt1 stay a capability gap at
  the prompt rung; the next rung is structural (a separate step that enumerates the paths
  behind each quantified claim before judging), worth trying only if more misses of this
  shape turn up.

## 2026-11-27 — Held-out confirmation of the final rules (HEAD 8745c0ac + seeder scope)
- Change: none new; confirms the sweep entry and the seeder-scope entry together against
  the pre-sweep rules.
- Hypothesis: the dev-set recall gain (24/44 → 29/44) carries over to PRs the rules were not
  written from.
- Eval: real-PR A/B, held-out set `prs-heldout.tsv` / `gt-heldout.json` (4115, 4168, 4268,
  4281, 4626; GT 100–110), Opus 5.5, k=3 (k=4 on 4115 and 4168: both OAuth tokens hit the
  5-hour limit on trial 4), blind judge per PR. Outputs and judges in `heldout/`.
- Result: recall 16/36 → 24/36; paired per (PR, trial) +1 ×8, +2 ×1, 0 ×6, −1 ×2. The gain is
  the changeset check: gt102, gt104, gt108 0/10 → 10/10. Without those, recall 16/27 → 14/27:
  gt109/gt110 (counts in a doc outside the diff) +2, gt106 +1, but gt100 (401 schema in
  `openapi.json` vs the new error envelope) 2/4 → 0/4 — three runs cleared it as "the DTO
  moved unchanged" — and gt107 (a "verbatim" source block in a doc in the diff) 2/3 → 0/3.
  gt103 (pre-existing wrong policy-id spelling) 0/3 in both. Valid extras 46 → 100, reaching
  the report 31 → 88; invalid reaching the report 0 → 2 (both treat a frozen SPEC as live).
- Cost/latency impact: $2.26 → $2.92 per run (+29%), p50 193 s → 254 s (+31%).
- Decision: keep. The held-out set confirms more recall and twice the valid findings, but
  for doc drift itself it does not: the doc gain on the dev set did not carry over, and two
  in-diff checks regressed, possibly because the wider sweep takes attention from deep
  reads of the diff's own docs (one hypothesis, not yet tested). Next experiment, if any:
  scope the sweep's per-hit work so in-diff claim artifacts are judged first.

## 2026-11-27 — Dedicated `tests` lens (`tests.md`, six new rules; `readability-tests` → `readability`)
- Change: a new `tests` lens takes the three tests rules and adds `unwarranted-test`,
  `implementation-mirror`, `mechanism-name`, `redundant-test`, `obsolete-test` and
  `untested-behaviour`; an explicit project test-scope rule may raise `unwarranted-test`.
- Hypothesis: the old lens never raises "this test should not exist" (0/18 in the 65-run
  error analysis, `tests-lens/results/t0–t5`); the new rules catch those without false
  positives on known-good tests and without losing the moved rules.
- Eval: real-PR A/B, dev 4126, 4598, 4281, 4474 / held-out 4342, 4115, 4472, 4268, baseline
  HEAD 1fa0d643 vs working tree, Opus 5.5, k=4, one blind judge per PR (blinding partial:
  the new rule names give the variant away). `evals/local/tests-lens-ab/` (`gt.json`,
  `judge/`, `results.json`).
- Result: GT catches dev 0/32 → 18/32, held-out 0/28 → 15/28 (human-evidence items dev
  0/28 → 17/28; held-out has one, 0/4 → 0/4). 15 of the 17 `unwarranted-test` catches sat
  in CANDIDATES, and the merge moved 21 of 23 such candidates to `Not flagged`, deciding
  them against `merge-contract.md`. Moved rules: dev 5/12 → 7/12, held-out 6/8 → 2/8
  (4342-cache 3/4 → 0/4, the 250 ms boundary cleared on false grounds). Calibration false
  positives 0 in both. Primary extras precision 87% → 95% (71/82 → 91/96).
  `implementation-mirror` gave 7 invalid candidate extras; 4281-notify (a spec mocking the
  repo's own `useNotification`) was cleared 4/4 as "the observable effect".
- Cost/latency impact: $69.88 → $72.83 for 32 runs (+4%); p50 149 s → 187 s (+25%).
- Decision: keep the lens, fix before release: (1) cr-merge must keep an unsettled
  `unwarranted-test` / `implementation-mirror` candidate in CANDIDATES — re-run only the
  merge on the existing `out/*/candidate-t*/ctx` to confirm; (2) the held-out mutation-gap
  regression on 4342 needs a look before claiming the moved rules are intact; (3) narrow
  the observable-effect exception to calls that leave the repo (queue, HTTP, notifier of a
  third party), not the repo's own modules.

## 2026-11-27 — Merge keeps test-value candidates as report-only bullets
- Change: `merge-contract.md`: an `unwarranted-test` / `implementation-mirror` candidate becomes
  its own bullet (`keep or delete — <what to weigh>`), report-only; the merge may clear it only
  on a fact the Scanner lacked (the target had tests at the base, a named test reaches the same
  cases), never on a reason for keeping the test.
- Hypothesis: the tests-lens A/B lost 21 of 23 GT candidates to `Not flagged` because the
  report had no home for an undecided candidate; giving it one moves them into the body
  without bullets on known-good tests.
- Eval: merge-only re-run on the 32 saved candidate scans (`outm-m1/`, variant `m1`), Opus 5.5;
  judge `judge/merge-m1.json` (not blind: one variant).
- Result: GT recall items in the report body 22 → 38 of 60 item-trials. Of 38 `keep or delete`
  bullets, 29 fair, 5 unfair, 4 unsure. Unfair: 2 rest on a scanner's false "no tests at the
  base" (4115), 2 hit calibration tests (4268 cron batching, 4472 90-day window), 1 an e2e
  test the rule exempts (4598). Still cleared: 4281-notify (4/4), 4474-pfpn (4/4), 4268-mctrl.
- Cost/latency impact: $26.91 for 32 merges; scans unchanged.
- Decision: keep. A wrong bullet costs the user one "keep"; a cleared one cost a teammate's
  review. Next: the merge should check a scanner's "untested at the base" claim before it
  renders the bullet, since that fact carries the rule.

## 2026-11-27 — Moved-code exemption limited to asking for a missing test
- Change: `tests.md`: "code the change only moved" exempts asking for a test that does not
  exist, never a test the change adds or edits; `mutation-gap` also covers a new test of a
  moved decision.
- Hypothesis: the held-out regression on 4342-cache (3/4 → 0/4: "not judged as mutation-gap on
  moved code") comes from the `untested-behaviour` exemption leaking into the other rules.
- Eval: real-PR scans on 4342, variant `s2` (candidate + new `tests.md`, old merge), Opus 5.5,
  k=4; promptfoo eval-38, 39, 50, 51 k=2 with both fixes.
- Result: 4342-cache 0/4 → 4/4 (`test-fidelity` on the 250 ms title vs 251 ms input), in the
  report body 4/4; promptfoo 8/8.
- Cost/latency impact: $7.63 → $7.09 for the 4 scans; p50 ≈ 155 s.
- Decision: keep. Measured on one PR only; the next full A/B checks the other seven.

## 2026-11-27 — Narrow implementation-mirror's observable-effect exception (not shipped)
- Change considered: count a call as the observable effect only when the double sits on a
  third-party client or transport, not on a repo-owned wrapper (notifier, mailer service).
- Why dropped before measuring: 4281-notify asserts the message an error code maps to, which
  is the outcome, through the repo's `useNotification`; it has the same shape as eval-51's
  known-good `publishCancelled` test on a repo-defined `Publisher` port, and the project had no
  test-scope rule against it at that SHA. The narrowing would flag good tests; the owner's
  deletion is a judgment the code does not carry. 4281-notify should move from recall to a
  borderline case in `gt.json`.

## 2026-11-28 — Full A/B of the final tests lens (both fixes + premise check)
- Change: `final` = HEAD (fix 1, fix 2) + the merge checking a scanner's "no tests at the base"
  claim with `git grep` on the target's exported names before rendering an `unwarranted-test`
  bullet. Baseline = the pre-lens plugin (`readability-tests`), same 32 saved cells.
- Hypothesis: the fixes keep the first A/B's recall gain, put the candidates in the report body
  and remove the held-out `mutation-gap` regression.
- Eval: 8 PRs × 4 trials, Opus 5.5, blind judges (`judge-final/`, `results-final.json`);
  4281-notify moved to excluded, 4115-bus excluded.
- Result (baseline → final):
  - human-evidence recall 0/28 → 15/28; analyst-only 0/28 → 14/28;
  - moved rules 11/20 → 15/20 (held-out 6/8 → 8/8; 4342-cache 3/4 → 4/4);
  - candidates placed correctly 1 → 16;
  - primary extras valid/invalid 82/27 → 111/13; calibration false positives 0 → 2 (4342 routes
    integration test called redundant, A-t3/A-t4).
  - Still missed by both: 4474-pfpn, 4342-problem, 4115-redund, 4268-mctrl, 4126-ceh.
- Defect found: the premise check let an e2e test that reaches the component through a page
  refute "untested at the base" (4126 compassMasterControl, cleared 3/4). Narrowed: only a unit
  or integration test importing the target refutes; an e2e reach is named as coverage to weigh.
  Merge-only re-run on the 4 final 4126 cells (`outm-f2/`): the spec reaches the report 2/4
  (was 0/4); the other two are a keeping-reason clearance and a scan that never raised it.
- Cost/latency impact: scans $69.88 → $75.39 (+8 %), median 149 s → 172 s (+15 %); f2 merges
  $2.79. Experiment total ≈ $78.
- Decision: keep. Next, if it recurs: `redundant-test` should not call an integration test
  redundant with a contract package's schema test (4342).

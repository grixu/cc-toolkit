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

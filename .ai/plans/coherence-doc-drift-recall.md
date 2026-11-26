# Coherence: doc-drift recall (code changed → docs, schemas, generated files)

Source: audit of 85 recorded `/code-review:start-cr` sessions (2026-09 → 2026-11), 8 subagents,
results in the session scratchpad (`results/b0…b7.json`). 40 runs had a PR to compare against;
37 ran the coherence lens. 29 misses, 44 true positives.

- 20 misses come from versions before coherence existed (docs, changesets, `openapi.json`, `schema.ts`
  skipped outright). Most of these the current lens would likely see, because the doc is in `<files>`.
- 9 misses happened with coherence running. Causes:
  - shallow clearance (4): "never" traced to one of two paths, condition checked but not the outcome,
    an inventory excused as "already stale", "once" vs every call left undecided;
  - untouched doc not reached (1): new side effect with no new identifier;
  - lost in merge (3): boy-scout → Not flagged, folded into a correctness fix that names only code,
    a same-diff report cleared as "history";
  - active spec owned by `spec`, which cleared a stale decision row because an ADR approved the change (1).
- Pre-coherence untouched-doc misses (4183, 4268) came from identifiers on `-` lines and from the
  changed format of an identifier — the claim-first step lists only `+` identifiers.
- Repo-wide Grep was blocked by a search hook in 4 coherence runs and the report did not say so.
- Evidence is mostly author fix commits and the pullfrog bot; teammate comments raised 3 of the 29.

## Steps

### Rules — `references/rules/coherence.md`
- [x] Claim-first step 2: identifiers from `-` lines too (removed or renamed symbols, file paths,
      routes, env keys, log/error codes, enum members), and the changed *format* of an identifier.
- [x] New step: reverse sweep — Grep every prose artifact in the repo (outside `<files>` too) for
      each listed identifier and for the changed module/route/class name; a hit that describes the
      pre-change state is `doc-drift`.
- [x] `doc-drift` Flag: counting and exclusivity claims ("N controllers", "the one route",
      "never/always/only/every") are checked against the full registry or every call site, never one path.
- [x] `doc-drift` Flag: check the outcome a sentence states, not only the branch condition.
- [x] Clearance discipline: a "holds" in Not flagged must cite the code `path:line` it was checked
      against; without it the claim is a CANDIDATE.
- [x] Calibration: an already-stale listing does not excuse the member this change adds.
- [x] "Acknowledged by the change" narrowed: a deferral clears only when it names the doc; a decision
      that makes a published contract (OpenAPI, SDK) untrue stays a finding.
- [x] `contract-drift`: when the change edits a DTO, handler, enum or route that feeds a committed
      generated artifact (`openapi.json`, `schema.ts`, generated client), Grep that artifact for each
      added/removed member — mandatory, not "may be Read".
- [x] Report a blocked repo-wide search in the lens output (`files judged` line); merge surfaces it.

### Spec lens — `references/rules/spec.md`
- [x] A decision row or code sketch in the active spec that describes the mechanism the diff changes
      is a finding even when an ADR approves the change: the fix is "update the spec". Done as a new
      `spec` · stale-spec row (medium), so the rule count is 69.

### Merge — `references/merge-contract.md`
- [x] A `doc-drift` whose code side this diff changed is primary, never boy-scout / Not flagged for
      sitting outside the hunk.
- [x] Folding a `doc-drift` into another finding carries the doc `path:line` and sentence into the fix.
- [x] A report, ADR or plan written in the same diff is never "history".

### Pending owner decisions
- [x] Behavioural invariants in a module `CLAUDE.md` (e.g. `xenos/CLAUDE.md` "fail open") — keep
      suppress-only, or allow them as CANDIDATE "intent unconfirmed". Owner: CANDIDATE; ADR 0003 amended.
- [x] Missing changeset in a repo that requires one (4168, 4281, 4268) — new rule or out of scope.
      Owner: a Flag on `missing-counterpart`, keyed on `.changeset/config.json`.

### Verification
- [x] Promptfoo scenarios from real cases (changed: one diff-based sandbox, eval-48 recall with five
      seams and eval-49 calibration; the merge rules are covered by the real-PR A/B only): removed identifier named in an untouched doc (4183),
      "Eleven controllers / the one route" (4427), "never fetches" with two paths (4472), new enum
      missing from `openapi.json` + `schema.ts` (4276), boy-scout doc-drift kept primary (81).
- [x] A/B on real PRs with the method in memory `code-review-coherence-assumptions-1028`
      (4472, 4598, 4183, 4276, 4427, 4511): recall on these misses and precision on controls.
      Run 2 (Opus 5.5, k=4, blind, after the "pre-existing prose" rule): recall 29/44 vs 24/44,
      extras valid 49/59 vs 40/46, cost $57 vs $47. Gain is in 4427 (counts) and 4472 gt3
      (inventory); 4472 "never fetches" and both 4598 items stay 0/8 in both variants.
- [x] CHANGELOG `[Unreleased]`, README lens row, `node scripts/verify-plugins.mjs`, `claude plugin validate`.

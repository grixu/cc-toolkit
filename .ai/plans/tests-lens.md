# Plan: a `tests` lens that judges whether tests are worth having

## Evidence (65 past CR runs, 2026-09 to 2026-11, six analysis batches)

51 runs changed tests, 107 test files were read. Test issues raised after the review, by category
(caught by the review / total):

| category | caught / total |
|---|---|
| unneeded-test | 0 / 18 |
| missing-test | 4 / 17 |
| implementation-mirror | 2 / 7 |
| mechanism-name | 1 / 3 |
| ac-not-tested, redundant-with-higher-level | 0 / 3 |
| existing-rule (test-fidelity, mutation-gap, test-structure) | 20 / 21 |

- **The owner's main case is common.** 28 of the 107 test files target a file that existed with
  no tests before the PR; 22 of them were judged questionable or not worth keeping, 15 are
  white-box. Humans deleted or questioned 9: #4126 ×2, #4598, #4281 ×5 (b5515ef69), #4474 ×2.
  No review raised any of them; several were praised ("pinned both ways").
- **The existing rules work** when they fire, but can push the wrong way: `mutation-gap` asked
  for more boundary cases in a spec that only tests class-validator decorators (#4669); a review
  suggested asserting mock call order (#4405); the apply step extended a spec the owner deleted
  three days later (#4281).
- **Coverage gaps that drew complaints are scenarios, not decisions**, and the ones that
  mattered were security or contract guarantees (`redirect: 'manual'`, HTML escaping, a
  rollback path, a 404). Gaps outside those drew no complaints.
- **Conflict with repo conventions:** `test-structure` calls `// given / when / then` labels
  "welcome"; console-monorepo forbids them with a hookify rule (removed in 720249635).
- **Scope blind spot (out of this plan):** many of the owner-case specs were committed after the
  review ran, or outside a partial commit range (#4674, #4418).

Results: the scratchpad `tests-lens/results/t0..t5.json` (to be pushed to R2 with the A/B data).

## Shape

- New lens **`tests`**, rules file `references/rules/tests.md`, owning the whole `tests` family.
  `test-structure`, `test-fidelity` and `mutation-gap` move there unchanged in substance.
- `readability-tests` becomes **`readability`** (`references/rules/readability.md`), the
  readability family only.
- Lens count 12 → 13. Always active when the change has `test` or `source` files; its
  `<files>` are those two kinds. It reads across files: the target's tests at the base commit
  (`git show <base>:<path>`, `git ls-tree`), the callers' tests one hop, the active spec's
  acceptance criteria when there is one.

## New rules (family `tests`)

| rule | flags | severity |
|---|---|---|
| `unwarranted-test` | a test the change adds that should not exist, at **any level** — unit, integration, e2e. The question is the same at each level: what does this test guard that nothing else does, and is it worth its cost? Flags: (a) a new unit-test file for a target that existed at base with no tests, where the change touches a minority of its public surface and the new code is neither critical (auth, money, data loss, a public contract) nor complex; (b) an integration or e2e test that adds no scenario beyond an existing test at the same or a higher level, or boots the app/browser to pin a change a cheaper level already pins; (c) a test of framework configuration (validator decorators, DI wiring), a pass-through controller, a wrapper around `useQuery`/`useMutation`; (d) a test outside an explicit project test-scope rule. White-box strengthens (a), never triggers it alone. An integration/e2e test of a user flow the suite does not reach yet is warranted. Critical, complex, a regression test for a bug the change fixes, or any doubt → `CANDIDATES`, so the user decides. | medium |
| `obsolete-test` | a test that already existed and that **this change made pointless**, yet it was not removed: it exercises a behaviour, branch, flag, route or field the change deleted; it stays green only because a mock or fixture still stands in for removed code; the change edited it only to keep it passing (a renamed call, a dropped assertion) so it no longer guards anything; a `skip`/`todo` for a feature the change removed; a fixture or test helper no remaining test uses. Found by Grepping the identifiers on the diff's `-` lines in `test` files, as coherence does for prose. Tests that were already pointless before the change, with no link to it, are a `Not flagged` line, not a finding. | medium |
| `implementation-mirror` | the only assertions are on calls, call counts or arguments of a mock of a collaborator the repo owns; a test mocks the function the change modified and asserts on that mock; a stub of a repo-owned collaborator returns a state the real one cannot produce. Cleared where the call *is* the observable effect (queue publish, email, third-party HTTP). | medium |
| `mechanism-name` | a scenario title that narrates calls or their order ("invokes repository save", "writes the label, then saves, then logs") instead of the behaviour or rule it guards | nit |
| `redundant-test` | a test whose cases another test already pins — in the same change, or an existing test of a caller that reaches the same inputs and outputs | medium |
| `untested-behaviour` | a security or contract guarantee, a rollback/data-loss path, or an acceptance criterion of the active spec that the change adds or changes and that no test reaches, directly or one hop through a caller's test. Moved-only code and the untouched rest of the file are out of scope. | high for security/contract, medium otherwise |

Conventions (owner decision 2026-11-27): an explicit test-scope rule in a project file
(`.claude/rules/**/testing.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`) — "no specs for X" —
may **generate** `unwarranted-test`, quoted with its file. This is the only exception to
suppress-only; every other convention still only suppresses. The conventions note must therefore
carry such rules verbatim to the `tests` scanner.

Boundaries with other lenses: `simplicity` · `dead-code` stays on source, never on test files;
near-identical cases inside one test file that a table would fold stay `simplicity` ·
`shallow-duplication`; the same behaviour pinned in two tests or at two levels is `redundant-test`.

Precedence: `unwarranted-test` and `obsolete-test` are judged first; a test it flags gets no `mutation-gap` or
`test-structure` ask (no polishing a test that should not exist). `test-structure` defers to a
convention or hookify rule on phase labels.

## Steps

- [x] 1. `references/rules/tests.md`: the moved three rules plus the six new ones, each with
      Flag / Suggested fix / Calibration, written from the rules above, not from the PR cases.
- [x] 2. Rename `readability-tests.md` → `readability.md`; drop the tests family from it.
- [x] 3. Wiring: `review-setup.md` (active set, `<files>`), `scanner-contract.md` (lens list,
      cross-file reads), `severity.md` (master table), `merge-contract.md` (tally example, family
      ownership), `scope.md` if needed, `cr-prepare` / `cr-scan` skills, `commands/start-cr.md`,
      `codex/skills/start-cr/SKILL.md`, `.claude/skills/fd3-run-metrics/scripts/report.mjs`.
- [x] 4. Docs: README lens table and count, `CONTEXT.md`, ADR 0007 (tests lens, rename,
      coverage reversal of the `mutation-gap` "coverage out of scope" line), docs site EN + PL
      (`how-it-works.md`, `reference.md`, `start-cr.mdx`), CHANGELOG `[Unreleased]`.
- [x] 5. Evals: rename the craft fixtures' `readability-tests` lens files; new promptfoo cases —
      recall (an untested service gains two methods plus a white-box spec; a mock-only
      controller spec; an e2e test duplicating an existing flow test; a mechanism-named title; an
      untested auth guarantee; a test left exercising a branch the change deleted) and
      calibration (an integration test of a flow nothing reached yet, a regression test for a
      fixed bug, a queue-publish assertion, a critical-but-small change that must land in
      `CANDIDATES`, an already-pointless test unrelated to the change).
      Done as eval-50 (recall) and eval-51 (calibration); 38, 39, 50, 51 pass 2/2.
- [x] 6. Real-PR A/B with the coherence harness: dev set #4126, #4598, #4281, #4474; held-out
      #4342, #4115, #4472, #4268 (GT from human deletions and comments first, analyst verdicts
      marked as such). Old rules vs new, Opus, k=4, blind judge; report recall, precision,
      CANDIDATES vs primary placement, cost. Log in `agent-engineering/experiment-log.md`.
      Done: GT 0/60 → 33/60, but merge clears CANDIDATES and 4342 mutation-gap regressed; fixes 8–10.
- [x] 7. `verify-plugins.mjs`, `claude plugin validate`, `claude plugin test`; commit per logical
      change. `claude plugin test` for code-review cannot run locally while the A/B worktrees
      sit under `evals/local/`; CI has none.
- [x] 8. cr-merge keeps an unsettled `unwarranted-test` / `implementation-mirror` candidate in
      CANDIDATES; confirm by re-running only the merge on the A/B candidate contexts.
      Done (8318b102): GT in report body 22 → 38/60; 29 of 38 keep-or-delete bullets fair.
- [x] 9. Find and fix the held-out `mutation-gap` regression on #4342 (250 ms boundary).
      Done (c863bb09): moved-code exemption leaked into mutation-gap; 4342-cache 0/4 → 4/4.
- [x] 10. Narrow the `implementation-mirror` observable-effect exception to calls that leave the
      repo.
      Skipped: 4281-notify asserts the mapped message (an outcome), the same shape as eval-51's
      known-good publish test, so the narrowing would flag good tests.

## Out of scope (follow-ups)

- Running the lens on commits made after the review, or flagging new test files outside a partial
  commit range.
- Making the apply step re-judge tests its own fixes add.

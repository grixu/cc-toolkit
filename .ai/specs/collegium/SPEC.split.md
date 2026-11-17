# Split report: collegium

Spec: `/Users/mateusz/grixu/cc-toolkit-collegium/.ai/specs/collegium/SPEC.md`
Tasks: `/Users/mateusz/grixu/cc-toolkit-collegium/.ai/specs/collegium/tasks/` (29 files, `0001`–`0029`)

Taken against this verdict, quoted verbatim from the spec's last evidence block:

> Verdict: ready — claims: 51 verified / 6 deferred / 0 blocked — spec 702 lines at this verdict

`wc -l` on the spec: 702. Re-split 2026-11-17 after validate-spec pass 5 (D63–D65). Checked at
`d7f6da87`; `origin/main` fetched 2026-11-17 is `28b8dde9` (#61). Of the paths it changed, the
spec cites only `plugins/dev-kit/hooks/register.ts`: its symbols are intact but the pins moved
(`:50` → `:64`, `:336` → `:454`). On the user's instruction the split corrected those two pins in
the spec (D6 and the section 10 row) instead of stopping for `/fd3:build-spec`. No validation pass
has checked that edit; the line count is unchanged.

Re-split changes against the first split: the graph, branches and ordinals are unchanged (no work
item, element, phase or gate changed). `codex-adapter`, `ci-eval-spike` and `collegium-evals-ci`
now point at D63–D65 (the WIF CI path, `prepare`, the model pin), and the `OPENAI_API_KEY` secret is
gone from `ci-eval-spike` and from Still owed. Every replaced file was `status: todo` with no
worktree, so nothing implementation wrote was lost.

## Tasks

| # | slug | repository | branch | phase | depends-on | elements |
|---|---|---|---|---|---|---|
| 0001 | probe-mod-host | none | — | 1 | — | TEST-5 |
| 0002 | collegium-scaffold | cc-toolkit-collegium | feat/collegium | 2 | — | CONFIG-1, DOCS-1 |
| 0003 | codex-adapter | cc-toolkit-collegium | feat/collegium | 2 | collegium-scaffold | INTEGRATION-1, INTEGRATION-2, TEST-1 |
| 0004 | config-merge | cc-toolkit-collegium | feat/collegium | 2 | probe-mod-host, collegium-scaffold | CONFIG-2, TEST-1 |
| 0005 | decision-client-copy | cc-toolkit-collegium | feat/collegium | 2 | — | INTEGRATION-3 |
| 0006 | model-choice | cc-toolkit-collegium | feat/collegium | 2 | collegium-scaffold, decision-client-copy, config-merge, codex-adapter | INTEGRATION-3, TEST-1 |
| 0007 | prompt-wrapper | cc-toolkit-collegium | feat/collegium | 2 | collegium-scaffold | INTEGRATION-4, TEST-1 |
| 0008 | write-modes | cc-toolkit-collegium | feat/collegium | 2 | collegium-scaffold | INTEGRATION-6, TEST-1 |
| 0009 | run-lifecycle | cc-toolkit-collegium | feat/collegium | 2 | probe-mod-host, collegium-scaffold, codex-adapter, prompt-wrapper, write-modes | INTEGRATION-5, TEST-1 |
| 0010 | tools-registration | cc-toolkit-collegium | feat/collegium | 2 | collegium-scaffold, config-merge, codex-adapter, model-choice, prompt-wrapper, write-modes, run-lifecycle | API-1, API-2, API-3, TEST-1 |
| 0011 | live-check-script | cc-toolkit-collegium | feat/collegium | 2 | tools-registration | TEST-2 |
| 0012 | run-and-config-ui | cc-toolkit-collegium | feat/collegium | 2 | tools-registration | UI-1, UI-2 |
| 0013 | collegium-readme | cc-toolkit-collegium | feat/collegium | 2 | collegium-scaffold, run-and-config-ui | DOCS-1 |
| 0014 | ci-eval-spike | none | — | 3 | run-and-config-ui | CICD-1 |
| 0015 | collegium-evals-ci | cc-toolkit-collegium | feat/collegium | 3 | ci-eval-spike, run-and-config-ui | TEST-3, CICD-1, CICD-2 |
| 0016 | release-collegium | none | — | 3 | collegium-evals-ci, collegium-readme, live-check-script | TEST-2 |
| 0017 | cr-codex-reference | cc-toolkit-collegium | feat/code-review-codex-review | 4 | — | INTEGRATION-7 |
| 0018 | cr-collegium-option | cc-toolkit-collegium | feat/code-review-codex-review | 4 | — | CONFIG-3 |
| 0019 | cr-merge-skip | cc-toolkit-collegium | feat/code-review-codex-review | 4 | cr-codex-reference | INTEGRATION-7 |
| 0020 | cr-scan-prepare-codex | cc-toolkit-collegium | feat/code-review-codex-review | 4 | cr-codex-reference | INTEGRATION-7 |
| 0021 | cr-scanner-tools | cc-toolkit-collegium | feat/code-review-codex-review | 4 | — | INTEGRATION-7 |
| 0022 | cr-start-cr-codex | cc-toolkit-collegium | feat/code-review-codex-review | 4 | cr-codex-reference, cr-collegium-option | INTEGRATION-7 |
| 0023 | cr-docs | cc-toolkit-collegium | feat/code-review-codex-review | 4 | cr-collegium-option, cr-merge-skip, cr-scan-prepare-codex, cr-scanner-tools, cr-start-cr-codex | DOCS-2 |
| 0024 | release-code-review | none | — | 4 | cr-docs, release-collegium | CONFIG-3, INTEGRATION-7 |
| 0025 | fd3-workflow-codex | cc-toolkit-collegium | feat/fd3-codex-review | 5 | — | INTEGRATION-8, TEST-4 |
| 0026 | probe-configure-json | none | — | 5 | release-code-review | — |
| 0027 | fd3-step2-question | cc-toolkit-collegium | feat/fd3-codex-review | 5 | probe-configure-json, fd3-workflow-codex | INTEGRATION-8 |
| 0028 | fd3-docs | cc-toolkit-collegium | feat/fd3-codex-review | 5 | fd3-step2-question, fd3-workflow-codex | DOCS-3 |
| 0029 | release-fd3 | none | — | 5 | fd3-docs, fd3-workflow-codex, release-code-review | INTEGRATION-8 |

Repository for every delivery task: `/Users/mateusz/grixu/cc-toolkit-collegium` (`grixu/cc-toolkit`).

### What each edge shares

- `collegium-scaffold` ← every collegium module task with tests: the `plugins/collegium/` manifest
  and `hooks/hooks.json` that `claude plugin test` loads; `collegium-readme` fills in its README,
  description and marketplace entry.
- `probe-mod-host` ← `config-merge` (G4 answer), `run-lifecycle` (G1, G2 answers): declared gaps that
  decide what is written.
- `codex-adapter` ← `model-choice` (`Palette`/`Model` types, catalogue), `run-lifecycle`
  (`invocation`, `parseEvent`, `finalMessage`), `tools-registration`.
- `decision-client-copy`, `config-merge` ← `model-choice`: the copied client and the merged tiers,
  exclusions and `decision.backend`.
- `prompt-wrapper`, `write-modes` ← `run-lifecycle`: section 7, "Inside phase 2, C10 is written
  before C8 and C9, which call it"; pass 2's build order "C7 before C8".
- `run-lifecycle`, `model-choice`, `config-merge`, `prompt-wrapper`, `write-modes`, `codex-adapter`
  ← `tools-registration`: `register.ts` calls each module.
- `tools-registration` ← `live-check-script`, `run-and-config-ui`: the tool names they call.
- `run-and-config-ui` ← `ci-eval-spike`, `collegium-evals-ci`, `collegium-readme`: the
  `/collegium:run` skill the eval drives and the README describes.
- `ci-eval-spike` ← `collegium-evals-ci`: the G3 outcome decides eval arm vs `claude plugin test` job.
- `cr-codex-reference` ← `cr-merge-skip`, `cr-scan-prepare-codex`, `cr-start-cr-codex`: the
  reference's `codex.md` shape, skip header and run parameters.
- `cr-collegium-option` ← `cr-start-cr-codex`: `${user_config.collegium_run}`.
- `fd3-workflow-codex` ← `fd3-step2-question`, `fd3-docs`: the `codexReview` arg.
- `probe-configure-json` ← `fd3-step2-question`: the G6 answer.
- Operational edges: `release-collegium` ← `release-code-review` (the phase-4 live check needs
  collegium installed); `release-code-review` ← `probe-configure-json`, `release-fd3` (R3 and
  `collegium_run` installed).

## Branches

One repository, three landing units, three branches. None stacks: no task of a later unit has an
authorship edge onto a task of an earlier one (code-review and fd3 reference Collegium's tool names
and `--codex` as the spec's API-1–3 and INTEGRATION-7 define them, in files the earlier units never
touch). Creation order: `feat/collegium`, `feat/code-review-codex-review`, `feat/fd3-codex-review`,
all from `main`. Merge order, from `merge-after:`: `feat/collegium` → `feat/code-review-codex-review`
→ `feat/fd3-codex-review`. Names follow the repository's `feat/<slug>` convention (`git branch -r`).

No path cuts: the repository has no `CODEOWNERS`, `main` has no branch protection, and its one
ruleset (one approving review, signatures, no force-push) applies to every path alike, so the CI
workflow and `marketplace.json` edits share their unit's review. No irreversible element exists.

### feat/collegium

- Landing unit 1 (phases 1–3), PR 1. Base `main`, `origin/main` at `28b8dde9`. The reused
  `feat/collegium` checkout sits on `d7f6da87` and is 1 commit behind `origin/main` (#61, dev-kit
  only; no collegium file touched).
- Reused, per the user's answer to Q1 ("Reuse feat/collegium"): the spec's rollout table names this
  branch. It already carries the spec commit `aa2cd5c6`, so PR 1 lands the spec too.
- Gate-blocked tasks stay on this branch: `config-merge` and `run-lifecycle` wait on
  `probe-mod-host`, `collegium-evals-ci` on `ci-eval-spike`. D62 makes phases 1–3 one PR, and PR 1
  cannot merge before `collegium-evals-ci` lands anyway, so the gate genuinely holds the whole unit.
  The PR stays a **draft** until `ci-eval-spike` has recorded G3 and `collegium-evals-ci` has
  landed; the implementation run will pause at the two probe tasks.
- Size: about 35 files and 3,500–4,000 changed lines (spec section 7) — over this skill's
  2,000-line review threshold. Not subdivided: the user chose one PR (D62). If the review proves
  too long, revisit the rollout table in the spec (the writing report's PR 1a/1b proposal) rather
  than splitting the branch here.

### feat/code-review-codex-review

- Landing unit 2 (phase 4), PR 2. Base `main` at `28b8dde9`, 0 behind. The spec's "stacked on
  `main` after PR 1 merged" is a landing order, recorded as `merge-after: [feat/collegium]`; the
  branch needs no collegium file to be written.
- No gate-blocked task.

### feat/fd3-codex-review

- Landing unit 3 (phase 5), PR 3. Base `main` at `28b8dde9`, 0 behind. `merge-after:
  [feat/code-review-codex-review]`, which holds transitively behind `feat/collegium`. Section 7
  also says phase 5 merges after phase 4's **release**, not just its merge: `merge-after` can only
  name branches, so hold PR 3 until `release-code-review` is done.
- `fd3-step2-question` waits on the operational `probe-configure-json` (G6), which can only run
  after `release-code-review`. The spec's rollout makes PR 3 one PR held behind that release, so
  the unit stays together: PR 3 is a **draft** until `probe-configure-json` has recorded G6 and
  `fd3-step2-question` has landed. `fd3-workflow-codex` can be implemented at once.

## Coverage

Re-run over the files on disk with `task-graph.mjs`: no problems, the graph is acyclic, every edge
points at a lower ordinal, and `branch-base`/`merge-after` match on every task of each branch.

- **Work items:** C1–C16, R1–R7 and F1–F4 are each in exactly one task, except the two below.
- **Split along a seam:** C12 (TEST-1) is split by module: each phase-2 module task carries its
  own `tests/<module>.test.ts` (config, codex, choose, prompt, write, runs, register), so each
  module's TEST-1 row passes on its own.
- **Grouped:** F2 and F3 are one task, `fd3-workflow-codex`, so the workflow change and its TEST-4
  test land together.
- **Elements:** every code in section 4 lands in at least one task: CONFIG-1–3, INTEGRATION-1–8,
  API-1–3, UI-1–2, TEST-1–5, CICD-1–2, DOCS-1–3.
- **Phases:** 1 (`probe-mod-host`), 2, 3 (`ci-eval-spike`, `collegium-evals-ci`,
  `release-collegium`), 4, 5 — every phase is on at least one task. Each of the three gates (phases
  3, 4, 5) has its operational task: `release-collegium`, `release-code-review`, `release-fd3`.
- **Declared gaps** (the six `deferred` claims): G1, G2, G4 are tracked by `probe-mod-host`, which is
  the spec's own C1 work item that settles all three in one evidence file. G3 is tracked by
  `ci-eval-spike` (C15). G5 is tracked by `release-fd3`, whose triggered run is G5's named
  substitute. G6 is tracked by `probe-configure-json`. Reading: a gap that an operational task the
  spec already names settles is tracked by that task rather than by a duplicate one.
- **Done-when classes:** every row is the task's own, branch-level (`/verify`, the eval, the CI job
  on PR 1) or environment-level, and every environment-level row names `release-collegium`,
  `release-code-review` or `release-fd3`.
- **Cleanup:** section 9's only repository step, deleting the CI spike branch, is the last step of
  `ci-eval-spike`, which the spec places right after its outcome is recorded. Nothing contracts
  later, so there is no `cleanup` task.

## Still owed

- **Unvalidated spec edit:** the two `register.ts` pin corrections the split made on the user's
  instruction have no evidence row; the next `/fd3:build-spec` pass picks them up.
- **WIF mapping assertions** were suggested, not read back from OpenAI (spec Prerequisites, K6);
  `ci-eval-spike` exercises them.
- **Evidence commits:** `probe-mod-host`, `ci-eval-spike` and `probe-configure-json` write
  `.ai/specs/collegium/evidence/spikes.md` beside the spec. Committing it where the spec lives is
  the implementation stage's question. G6's answer arrives after PR 1 merged, so it lands on
  whichever branch is open then.
- **Hand runs:** the five operational tasks (`probe-mod-host` needs a human to press Stop in an
  interactive session; the three gates merge, release and install).
- **Open non-blocking findings carried from validation**, neither a work item: the
  `decision.ts:1-3` header still names three plugins after the fourth copy; three section 10 rows
  read "Not placed".

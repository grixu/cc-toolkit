# Split report: prepare-proof

Spec: `/Users/mateusz/grixu/cc-toolkit/docs/specs/prepare-proof/SPEC.md`. Task files: `docs/specs/prepare-proof/tasks/` (21 files, `0001`–`0021`). They replace the earlier split's 19 files, at Mateusz's answer "Zastąp" (2026-11-11). None of the earlier files had been claimed: every one was `todo` with an empty `worktree`.

## Precondition

Split taken against the last verdict line in the spec, quoted verbatim:

> Verdict: ready — claims: 91 verified / 5 deferred / 0 blocked — spec 800 lines at this verdict

That verdict is pass 9, which ran in this conversation. `wc -l` gives 800.

Repository fetched: `/Users/mateusz/grixu/cc-toolkit`. Its default branch is `main`, and `origin/main` is at `836deea`, the commit the spec was validated at. There is no drift since that verdict. The local `main` checkout is at `c738263`, behind `origin/main`, and carries no implementation commits for this spec.

## Tasks

| # | Slug | Repository | Branch | Phase | Depends on | Elements |
|---|---|---|---|---|---|---|
| 0001 | jev-client-copy | cc-toolkit | feat/prepare-proof | 1 | — | INFRA-1 |
| 0002 | pr-proof-user-config | cc-toolkit | feat/prepare-proof | 1 | — | CONFIG-1 |
| 0003 | proof-signals-tool | cc-toolkit | feat/prepare-proof | 1 | jev-client-copy | API-1, TEST-1 |
| 0004 | measure-proof-signals | cc-toolkit | feat/prepare-proof | 2 | proof-signals-tool | TEST-2 |
| 0005 | review-g5-result-size *(op)* | none | — | 2 | measure-proof-signals | — |
| 0006 | tune-signal-wording | cc-toolkit | feat/prepare-proof | 2 | proof-signals-tool, measure-proof-signals | API-1 |
| 0007 | review-g4-commit-variant *(op)* | none | — | 2 | measure-proof-signals, tune-signal-wording | — |
| 0008 | mask-script | cc-toolkit | feat/prepare-proof | 3 | measure-proof-signals | INFRA-2 |
| 0009 | shared-rules-manifest | cc-toolkit | feat/prepare-proof | 3 | measure-proof-signals | DOCS-1, INTEGRATION-1 |
| 0010 | screenshot-proof-skill | cc-toolkit | feat/prepare-proof | 3 | shared-rules-manifest | INTEGRATION-3 |
| 0011 | terminal-proof-skill | cc-toolkit | feat/prepare-proof | 3 | mask-script, shared-rules-manifest | INTEGRATION-4 |
| 0012 | walkthrough-record-only | cc-toolkit | feat/prepare-proof | 3 | shared-rules-manifest | INTEGRATION-5 |
| 0013 | prepare-proof-skill | cc-toolkit | feat/prepare-proof | 3 | measure-proof-signals, screenshot-proof-skill, terminal-proof-skill, walkthrough-record-only | INTEGRATION-2 |
| 0014 | pr-proof-docs | cc-toolkit | feat/prepare-proof | 3 | pr-proof-user-config, proof-signals-tool, prepare-proof-skill | DOCS-2 |
| 0015 | release-pr-proof *(op)* | none | — | 3 | pr-proof-docs, tune-signal-wording, review-g4-commit-variant, review-g5-result-size | — |
| 0016 | decide-cache-eviction *(op)* | none | — | 3 | release-pr-proof | — |
| 0017 | pr-open-eval-case | cc-toolkit | feat/pr-open-proof | 4 | — | TEST-3 |
| 0018 | pr-open-proof-section | cc-toolkit | feat/pr-open-proof | 4 | — | INTEGRATION-6, UI-1 |
| 0019 | decide-pr-risk-proof-context *(op)* | none | — | 4 | pr-open-proof-section | — |
| 0020 | dev-kit-docs | cc-toolkit | feat/pr-open-proof | 4 | pr-open-proof-section | DOCS-3 |
| 0021 | release-dev-kit *(op)* | none | — | 4 | dev-kit-docs, pr-open-eval-case, decide-pr-risk-proof-context | — |

`cc-toolkit` stands for `/Users/mateusz/grixu/cc-toolkit`. *(op)* marks an operational task: `repository: none`, no pull request.

### What each edge shares

| Dependent | Depends on | What they share |
|---|---|---|
| proof-signals-tool | jev-client-copy | The helpers and constants in `hooks/jev.ts` |
| measure-proof-signals | proof-signals-tool | Runs `signals.ts` |
| tune-signal-wording | proof-signals-tool | Both edit `hooks/signals.ts` |
| tune-signal-wording | measure-proof-signals | The wording and the G4 variant come from the measurement's outputs |
| review-g4-commit-variant | measure-proof-signals, tune-signal-wording | Reviews their outputs and the commit |
| review-g5-result-size | measure-proof-signals | Reads the result-size observation |
| mask-script, shared-rules-manifest | measure-proof-signals | Spec ordering, section 7: "Phase 3 is written after phase 2 by D29". Mateusz applied it to all of phase 3 (2026-11-11) |
| screenshot-proof-skill | shared-rules-manifest | Reads `references/rules.md` |
| terminal-proof-skill | mask-script | Runs `mask.sh` |
| terminal-proof-skill | shared-rules-manifest | Reads `references/rules.md` |
| walkthrough-record-only | shared-rules-manifest | Both edit `skills/walkthrough-video/SKILL.md` |
| prepare-proof-skill | screenshot-proof-skill, terminal-proof-skill, walkthrough-record-only | Invokes their skills and argument contracts |
| prepare-proof-skill | measure-proof-signals | The judging section moves in from the phase-2 draft |
| pr-proof-docs | pr-proof-user-config | Both edit `plugin.json`, and the docs describe the options |
| pr-proof-docs | proof-signals-tool, prepare-proof-skill | The docs describe the tool and the skills |
| dev-kit-docs | pr-open-proof-section | The docs describe `## Proof` |
| Operational tasks | their predecessors | A release follows what it releases; a decision follows what it decides on |

## Branches

There is one repository, `/Users/mateusz/grixu/cc-toolkit`. Its two branches do not stack.

Creation order:

1. `feat/prepare-proof`, from `main`.
2. `feat/pr-open-proof`, from `main`. Its `merge-after` is `feat/prepare-proof`.

Branch names follow the repository's `feat/` convention.

### feat/prepare-proof

- **Base:** `main`, at `origin/main` `836deea`. The local `main` is behind it.
- **Landing unit:** phases 1–3, closed by the phase-3 gate (D29), which `release-pr-proof` performs.
- **Landing constraint:** D29 sets two PRs and no per-task branches.
- **Ownership:** a single owner reviews everything, so ownership adds no cut.
- **Irreversibility:** none. Section 9 plans nothing irreversible.
- **Protected paths:** there is no `CODEOWNERS` file, and ruleset 17680500 has no path rules. `.claude-plugin/marketplace.json` is a release manifest, but it has the same reviewer as the rest of the unit, so it gets no cut.
- **No draft-PR hold:** no implementable task has an edge onto an operational task. The measurement reviews (`review-g4-commit-variant`, `review-g5-result-size`) hold only the release.

### feat/pr-open-proof

- **Base:** `main`, not stacked. None of its tasks has an edge onto pr-proof work, because pr-open reads only a file (D5).
- **Merge order:** after `feat/prepare-proof`, per D29 and section 7. The hold is recorded in `merge-after`.
- This replaces the earlier split's stack on `feat/prepare-proof`, so no retarget is needed.

### Size check

- **Unit one:** about 15 files and 1,110 lines.
- **Unit two:** about 18 files, seven of them fixture media and text, and 350 lines.

Both are under 80 files and 2,000 lines, so there is no warning.

## Work items split or merged

- **W5 is split** at the line between measuring and committing:
  - **measure-proof-signals** writes everything into the git-ignored `evals/proof-signals/local/` and makes no commit.
  - **tune-signal-wording** is the one commit that lands: the wording and G4's variant, in `hooks/signals.ts`.
- **W3 and W4 are merged** into proof-signals-tool, because TEST-1's probe rows check API-1 and TEST-1 together.

## Decisions carried from 2026-11-11

1. **The measurement is fully automatic.** The agent picks PRs with `gh search prs --author @me`, proposes the ground-truth table and reads `TYPESAFE_API_KEY`. Mateusz reviews at the end, through `review-g4-commit-variant` and `review-g5-result-size`.
2. **All of phase 3 is written after the measurement.**
3. **Manual verification runs at the release tasks.** The sample-repo triggered rows run in `release-pr-proof`, and the Draft-PR rows in `release-dev-kit`.

## Operational tasks

- **Gates:**
  - `release-pr-proof` performs the phase-3 gate.
  - `release-dev-kit` performs the final gate and covers section 10's dev-kit release item.
- **Declared gaps**, each tracked by its own task:
  - G4: `review-g4-commit-variant`;
  - G5's result-size half: `review-g5-result-size`;
  - cache eviction: `decide-cache-eviction`;
  - `pr_risk` context: `decide-pr-risk-proof-context`;
  - the dev-kit release: `release-dev-kit`.
- **Authorship:** none of these gaps blocks a task from being written.

## Coverage (step 5, re-run over the written files)

- **Work items:** W1–W15 are each in exactly one task, apart from the split and merge named above.
- **Element codes:** all 17 appear in at least one task. They are CONFIG-1, INFRA-1, INFRA-2, API-1, TEST-1, TEST-2, TEST-3, DOCS-1, DOCS-2, DOCS-3, INTEGRATION-1 to INTEGRATION-6, and UI-1.
- **Done criteria:** every delivery task has an element and a Done-when naming its rows. DOCS-3 has no row, as the spec says, so it inherits phase 4's verification.
- **Done-when classes:** every row is the task's own, branch-level, or environment-level, and each environment-level row names the task that exercises it (`release-pr-proof`, `release-dev-kit` or `measure-proof-signals`).
- **Phases and gates:** phases 1–4 each appear on at least one task, and both gates have an operational task.
- **Graph:** `task-graph.mjs` reports `problems: []`. There are no cycles, every edge points to a lower ordinal, each branch has one `branch-base` (`main`) and one `merge-after`, and `landing` holds `feat/pr-open-proof` after `feat/prepare-proof`.

## Still owed

- **The measurement review:** Mateusz reviews the ground-truth table, the figures and the G4 variant, and confirms G5's result size, before the pr-proof release.
- **Release-time choices:** the dev-kit bump level, and the two decisions in section 10.
- **Committing the spec:** the spec and its tasks are untracked in `docs/specs/`. Whether to commit them is the implementation stage's question.

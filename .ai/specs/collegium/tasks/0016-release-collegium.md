---
name: Gate 3 — merge PR 1, release collegium v0.1.0, live checks
status: blocked
spec: ../SPEC.md
elements: [TEST-2]
decisions: [D26, D62]
repository: none
branch:
branch-base:
merge-after: []
worktree:
phase: 3
depends-on: [remove-wif-path, collegium-readme, live-check-script]
tickets: []
---

## Goal

Phase 3's gate is passed: the collegium plugin's live checks have run on the author's machine, PR 1
is merged, `./scripts/release.sh collegium minor` has cut v0.1.0, and the release is installed
locally.

## Done when

This task inherits phase 3's gate (section 7, rollout table, phase 3 "Gate after?") and exercises
the environment-level rows the delivery tasks name:

- the TEST-2 parts of the INTEGRATION-1/2, -3, -4, -5, -6 and API-1–3 rows — `live-check.sh` run
  with Codex enabled;
- the UI-1 row's three `/collegium:run --wait` runs (TEST-2);
- the CONFIG-1 row's `/plugin configure collegium` toggle;
- the UI-2 row's triggered `/collegium:config` run.

## Where to look

- Section 7, "Rollout" — phase 3 row.
- Section 8, "Verification" — the rows above.
- Section 5, "Ownership" — release only through `scripts/release.sh`.

## Note

No pull request exists: merging PR 1, running `release.sh` and installing the release are hand
steps on `main` and the author's machine that no branch carries. Enabling Codex in
`/plugin configure collegium` for the live checks is the user's consent to send code to OpenAI
(D26, K2).

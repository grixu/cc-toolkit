---
name: dev-kit README and changelog for ## Proof
status: done
spec: ../SPEC.md
elements: [DOCS-3]
decisions: []
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/pr-open-proof
branch-base: main
merge-after: [feat/prepare-proof]
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-dev-kit-docs
phase: 4
depends-on: [pr-open-proof-section]
tickets: []
---

## Goal

dev-kit's README and the `[Unreleased]` section of its CHANGELOG describe pr-open's new `## Proof` section and how it reads the pr-proof manifest.

## Done when

- No row of its own: section 8 treats DOCS-3 as prose. It inherits phase 4's verification.
- A filled `[Unreleased]` is checked by `release.sh` itself: `release-dev-kit` exercises it.

## Where to look

- DOCS-3.
- What the docs describe: INTEGRATION-6, UI-1.

## Note

- The edge onto `pr-open-proof-section` exists because these docs describe the behaviour that task adds to `skills/pr-open/SKILL.md`.
- Write under `[Unreleased]` only, and change no `version`.

---
name: "CI: apply ledger migrations before the service deploy"
status: todo
spec: ../protected-path-spec.md
elements: [CI-1]
decisions: []
repository: /sandbox/split/repo-a
branch: feat/ci-migration-step
branch-base: main
worktree:
phase: "1"
depends-on: []
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

This task edits `.github/workflows/`, which repo-a's CODEOWNERS assigns to release-team — an
approval none of the spec's other work shares. It therefore lands on a branch of its own. Edit the
workflow directly; the approval is the pull request's review and nothing to confirm before writing
the code.

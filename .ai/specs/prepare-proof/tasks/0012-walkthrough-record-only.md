---
name: walkthrough-video record-only mode
status: merged
spec: ../SPEC.md
elements: [INTEGRATION-5]
decisions: [D15, D21, D31, D39, D43]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-walkthrough-record-only
phase: 3
depends-on: [shared-rules-manifest]
tickets: []
---

## Goal

`walkthrough-video` takes a `record-only` argument. With it, the skill reports the MP4's path and the confirmed `files` instead of copying the video to Downloads or attaching it to the PR, still cleans up, and uses the caller's stack. Without it, the skill behaves as today.

## Done when

- INTEGRATION-5 triggered row: environment-level, exercised by `release-pr-proof`.

## Where to look

- INTEGRATION-5.
- Section 6, work item W10: the lines it changes.
- D15, D43; also D21, D31, D39.

## Note

- The edge onto `shared-rules-manifest` exists because both tasks edit `skills/walkthrough-video/SKILL.md`: that task repoints its rules reference, this one changes the Deliver step.

---
name: Register the proof_signals tool, with unit tests
status: merged
spec: ../SPEC.md
elements: [API-1, TEST-1]
decisions: [D9, D10, D22, D23, D24, D33, D46, D51]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-proof-signals-tool
phase: 1
depends-on: [jev-client-copy]
tickets: []
---

## Goal

pr-proof's mod registers `mcp__pr-proof__proof_signals` when a key exists. The tool builds the per-part state, asks the five facts, aggregates them and returns signals or the unavailable result. The pure logic lives in `signals.ts`, and the unit tests cover it, including D51's retry wait.

## Done when

- TEST-1, API-1 (phase 1) probe row: this task's.
- TEST-1, API-1 (D51) probe row: this task's.
- API-1 (no key) triggered row: this task's, run from the branch with `--plugin-dir`.
- API-1 (key) triggered row: needs the user's TypeSafe key; `measure-proof-signals` exercises it with its live calls.

## Where to look

- API-1: registration, input, state, FACTS, output, errors and limits.
- TEST-1: what the tests cover and how they run.
- INFRA-1: the helpers this builds on.
- D46, D51; also D9, D10, D22, D23, D24, D33.

## Note

- The edge onto `jev-client-copy` exists because `register.ts` and `signals.ts` call the helpers and constants defined in `hooks/jev.ts`.
- W3 and W4 are one task: TEST-1's probe rows check API-1 and TEST-1 together.

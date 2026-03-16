# feature-delivery

End-to-end feature delivery workflow for Claude Code — from requirements gathering through implementation orchestration.

## Commands

| Command | Description |
|---------|-------------|
| `/start [description]` | Begin requirements gathering — 6-phase process producing a full specification |
| `/current [id\|--all]` | Requirements dashboard — status, progress, and available actions |
| `/edit [id]` | Edit existing specification — full re-analysis cycle with versioning |
| `/implement [id]` | Implementation orchestrator — parallel subagents, validation, quality gates |

## Workflow

```
/start "add dark mode support"
  → Complexity analysis
  → Discovery Q&A (user answers one at a time)
  → Codebase research (autonomous)
  → Technical Q&A (user answers one at a time)
  → Test planning (automated + manual)
  → Requirements specification generated

/current
  → View status, progress, next actions

/edit
  → Modify spec with full re-analysis and version tracking

/implement
  → Task decomposition into parallel waves
  → Agent execution (backend, frontend, e2e, infra)
  → Acceptance criteria validation
  → Quality gates (lint → test → build)
  → Completion report
```

## Prerequisites

- Claude Code with access to: Agent, Task (TaskCreate/TaskUpdate/TaskGet/TaskList), AskUserQuestion, LSP, WebSearch/WebFetch tools
- Worktree support recommended for implementation phase

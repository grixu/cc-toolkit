# Task Execution Template

Reference template — used by the orchestrator to prepare context for each execution subagent.

NOT a subagent prompt itself — the orchestrator calls `TaskGet(taskId)` to read task data, then fills this template for each Agent call.

## Field Sources (from TaskGet)
- [task-id] → metadata.taskId
- [task-name] → subject (strip the "task-id: " prefix)
- [What to Implement] → description
- [Deliverables] → metadata.deliverables
- [Patterns to Follow] → metadata.context
- Agent subagent_type → metadata.agent
- [Integration Points] → metadata.specSections cross-referenced with spec

```
## Task: [task-id] — [task-name]

### What to Implement
[Description from task decomposition — specific, actionable instructions]

### Deliverables
You MUST create or modify these files:
- [exact file path]: [what to create/change]
- [exact file path]: [what to create/change]

### Specification Reference
[Quoted relevant sections from the spec — only what this task needs]

### Patterns to Follow
[Relevant project convention patterns for this domain — naming, structure, conventions]

If domain convention files exist, read them before starting:
- [path to relevant convention file (AGENTS.md, CLAUDE.md, or similar)]

### Integration Points
[How this task's output connects with other tasks]
- Consumed by: [task-ids that depend on this task]
- Depends on (already completed): [task-ids and what they produced]

### Constraints
- Follow existing patterns in the codebase — search for similar implementations first
- Do NOT modify files outside the deliverables list without explicit justification
- Do NOT create new utilities/helpers unless the spec requires them
- Use anchor comments (AGENTS-NOTE:) only for non-obvious decisions

### Quality Checklist
Before finishing, verify:
- [ ] All deliverables created/modified
- [ ] Code follows project conventions for this domain
- [ ] No hardcoded values that should be configurable
- [ ] Error handling follows project patterns
- [ ] TypeScript types are properly defined (no `any`)
```

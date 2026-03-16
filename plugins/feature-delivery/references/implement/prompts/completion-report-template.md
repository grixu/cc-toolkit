# Completion Report Template

Reference template — used by the orchestrator to generate the final implementation report.

NOT a subagent prompt — the orchestrator fills in the template from Phase 5-7 results.

Data sources for this template:
- Task statuses and metadata: `TaskList` + `TaskGet(taskId)` for each task
- Validation results: Phase 6 subagent outputs (from context window)
- Quality gate results: Phase 7 outputs (from context window)
- Deliverable file paths: `metadata.deliverables` from each TaskGet result

```markdown
# Implementation Report: [Specification Name]

**Implementation Date**: [ISO-8601 timestamp]
**Specification Version**: v[X]
**Complexity**: [level] — [name]
**Duration**: [phases completed in this session]

## Executive Summary
[1-2 sentence overview: what was implemented, overall status]

## Task Execution Summary

### Completed Tasks ([X]/[Y])
| ID | Name | Agent | Status | Deliverables |
|----|------|-------|--------|-------------|
| [id] | [name] | [agent] | complete | [files created/modified] |

### Failed Tasks ([count] if any)
| ID | Name | Agent | Error | Attempted Fix |
|----|------|-------|-------|--------------|
| [id] | [name] | [agent] | [error summary] | [what was tried] |

## Validation Results

### Acceptance Criteria ([X]/[Y] passed)
- [x] [criterion 1] — [evidence]
- [x] [criterion 2] — [evidence]
- [ ] [criterion 3] — [gap description]

### Code Quality
- Issues found: [count] ([critical] critical, [warnings] warnings)
- Issues fixed: [count]
- Remaining: [count] — [brief description]

### Integration Status
- Integration points verified: [X]/[Y]
- Issues found: [count]
- Issues resolved: [count]

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| Lint | [pass/fail] | [issues fixed / remaining] |
| Test | [pass/fail] | [X/Y tests passing] |
| Build | [pass/fail] | [any notes] |

## Files Changed
### Created ([count])
- [file path] — [purpose]

### Modified ([count])
- [file path] — [what changed]

## Gaps & Known Issues
[List any unresolved items, with severity and recommended next steps]

## Recommendations
- [Next steps for the developer]
- [Areas requiring manual testing]
- [Follow-up tasks if any]
```

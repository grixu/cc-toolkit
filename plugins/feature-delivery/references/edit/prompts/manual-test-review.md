# Manual Test Review for Change Prompt

Launch with subagent_type: "general-purpose" — IN PARALLEL with automated-test-review.md

```
Review and update the manual test plan for a changed requirements specification.

CHANGE REQUEST: [paste user's change request]
COMPLEXITY ASSESSMENT: [paste Phase 3 results]
CURRENT TEST PLAN: [paste 05-test-plan.md — Manual Test Plan section]
DISCOVERY Q&A: [paste Phase 4 results]
TECHNICAL Q&A: [paste Phase 6 results]

TASK:
Review the current manual test plan against the change and determine:
1. Which existing scenarios are still valid as-is?
2. Which scenarios need updated steps or expected results?
3. Which scenarios are no longer relevant?
4. What NEW scenarios are needed for the change?

For each category, consider:
- Happy path changes — do standard workflows change?
- Edge case changes — are there new boundary conditions?
- Error scenario changes — do error flows change?
- Cross-browser / responsive changes (if UI involved)
- Security implications of the change
- Performance impact of the change

RETURN:
## Manual Test Plan Changes Summary
- Scenarios unchanged: [count]
- Scenarios modified: [count]
- Scenarios removed: [count]
- Scenarios added: [count]

## Updated Manual Test Scenarios

### Unchanged Scenarios
- [scenario name]: [still valid because...]

### Modified Scenarios
#### [scenario name] (MODIFIED)
**What changed:** [brief description of change]
**Priority:** [critical/important/nice-to-have]
**Prerequisites:** [updated if needed]
**Updated Steps:**
1. [step] → Expected: [result]
2. [step] → Expected: [result]

### Removed Scenarios
- **[scenario name]**: [why no longer relevant]

### New Scenarios
#### [scenario name] (NEW)
**Priority:** [critical/important/nice-to-have]
**Prerequisites:** [what's needed]
**Steps:**
1. [step] → Expected: [result]
2. [step] → Expected: [result]
```

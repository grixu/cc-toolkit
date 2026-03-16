# Manual Test Plan Prompt

Launch with subagent_type: "general-purpose" — IN PARALLEL with 05a-automated-tests.md

```
Create a manual testing plan for this feature.

FEATURE REQUEST: [paste $ARGUMENTS]
COMPLEXITY: [level and name]
DISCOVERY Q&A: [paste Phase 2 results]
TECHNICAL Q&A: [paste Phase 4 results]

TASK:
Create a comprehensive manual test plan covering:
1. Happy path scenarios — standard user workflows
2. Edge cases — boundary conditions, empty states, max limits
3. Error scenarios — what happens when things go wrong
4. Cross-browser / responsive considerations (if UI involved)
5. Security considerations (if applicable)
6. Performance expectations (if applicable)

For each test scenario, provide:
- Clear step-by-step instructions
- Expected results at each step
- Prerequisites (test data, accounts, environment)

RETURN:
## Manual Test Scenarios

### Scenario 1: [name]
**Priority:** [critical/important/nice-to-have]
**Prerequisites:** [what's needed]
**Steps:**
1. [step] → Expected: [result]
2. [step] → Expected: [result]

### Scenario 2: [name]
[...]
```

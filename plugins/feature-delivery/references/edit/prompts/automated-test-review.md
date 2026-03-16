# Automated Test Review for Change Prompt

Launch with subagent_type: "Explore" — IN PARALLEL with manual-test-review.md

```
Review and update the automated test plan for a changed requirements specification.

CHANGE REQUEST: [paste user's change request]
COMPLEXITY ASSESSMENT: [paste Phase 3 results]
CURRENT TEST PLAN: [paste 05-test-plan.md — Automated Tests section]
CODEBASE RESEARCH FOR CHANGE: [paste Phase 5 results — focus on test-related findings]
DISCOVERY & TECHNICAL Q&A: [paste key answers affecting test scope]

TASK:
1. Discover test infrastructure:
   - Search for test config files (jest.config.*, vitest.config.*, playwright.config.*, pytest.ini, etc.)
   - Identify test directories and their frameworks
   - Look for test convention files (AGENTS.md, CLAUDE.md in test directories)
   - Read 2-3 existing test files to understand current patterns
2. Review the current automated test plan against the change:
   - Which existing tests are still valid as-is?
   - Which existing tests need modification?
   - Which existing tests are no longer relevant?
   - What NEW tests are needed for the change?
3. Assess if any test TYPE needs to change:
   - Does a unit test need to become an integration test due to new complexity?
   - Does something need E2E coverage that previously didn't?
   - Are there tests that can be simplified or removed?

RETURN:
## Test Plan Changes Summary
- Tests unchanged: [count]
- Tests modified: [count]
- Tests removed: [count]
- Tests added: [count]

## Updated Automated Tests
### Unchanged Tests
- [test name]: [still valid because...]

### Modified Tests
- **[test name]** (was: [old type], now: [new type if changed])
  - Previous: [what it tested before]
  - Updated: [what it should test now]
  - Reason: [why the change affects this test]

### Removed Tests
- **[test name]**: [why no longer relevant]

### New Tests
- **[test name]**: [description]
  - Type: [unit/integration/e2e/component]
  - Verifies: [what requirement it validates]
  - Effort: [low/medium/high]
  - Priority: [critical/important/nice-to-have]

## Test Infrastructure Notes
[Any new infrastructure needs for the changed tests]
```

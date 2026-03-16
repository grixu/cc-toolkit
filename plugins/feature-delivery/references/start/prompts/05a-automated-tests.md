# Automated Test Analysis Prompt

Launch with subagent_type: "Explore" — IN PARALLEL with 05b-manual-tests.md

```
Analyze testing options for this feature in the project.

FEATURE REQUEST: [paste $ARGUMENTS]
COMPLEXITY: [level and name]
AFFECTED MODULES: [from Phase 1]
CODEBASE RESEARCH: [paste Phase 3 — focus on test-related findings]

TASK:
1. Discover test infrastructure:
   - Search for test config files (jest.config.*, vitest.config.*, playwright.config.*, pytest.ini, conftest.py, *_test.go, etc.)
   - Identify test directories and their frameworks
   - Look for test convention files (AGENTS.md, CLAUDE.md in test directories)
   - Read 2-3 existing test files to understand patterns
2. Read any test-specific convention files found
3. Identify which types of automated tests are possible and valuable:
   - Unit tests (service logic, utility functions)
   - Integration tests (API endpoints, database operations)
   - E2E tests (user workflows via browser automation)
   - Component tests (UI component testing)
4. For each possible test, describe what it would verify

RETURN:
## Available Test Infrastructure
- [framework]: [location and setup details]

## Recommended Automated Tests
### [Test Category]
- **Test name**: [description]
  - Type: [unit/integration/e2e/component]
  - Verifies: [what requirement it validates]
  - Effort: [low/medium/high]
  - Priority: [critical/important/nice-to-have]
```

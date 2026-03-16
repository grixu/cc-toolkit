# Task Decomposition Prompt

Launch with subagent_type: "Plan"

```
Decompose a requirements specification into an atomic task graph for parallel implementation.

SPECIFICATION: [paste full spec content]
CONTEXT DISCOVERY: [paste Phase 2 results — agent types, skills, project convention patterns]
COMPLEXITY: [level and name from spec §2]
TEST PLAN: [paste spec §5 or 05-test-plan.md content]

CORE PRINCIPLE: 1 task = 1 subagent call. Every task must be atomic — completable by a single Agent invocation.

TASK:
1. Analyze the specification section by section:
   - §3 Functional Requirements → identify user-facing implementation tasks
   - §4 Technical Requirements → identify implementation tasks with specific file paths
   - §5 Test Plan → create SEPARATE test tasks (each test = 1 atomic task)
   - §4.4 Integration Points → identify integration-critical ordering

2. For each task, define:
   - `id`: Unique identifier (format: `impl-[domain]-[N]` for code, `test-[type]-[N]` for tests)
   - `name`: Short descriptive name
   - `agent`: subagent_type from Context Discovery (backend, frontend, e2e, etc.)
   - `description`: What to implement — specific enough for the agent to work autonomously
   - `deliverables`: Exact files to create or modify (with paths)
   - `specSections`: Which spec sections this task implements (e.g., ["3.1", "4.1"])
   - `dependencies`: List of task IDs that must complete first
   - `context`: Relevant project convention patterns (from AGENTS.md, CLAUDE.md, or inferred from code)
   - `effort`: small (< 1 file) / medium (1-3 files) / large (3+ files)

   IMPORTANT: Your output will be used to create tasks via TaskCreate. For each task, ensure:
   - `id` + `name` → becomes TaskCreate `subject` (format: "[id]: [name]")
   - `description` → becomes TaskCreate `description` (must be self-contained for autonomous agent execution)
   - `agent` → stored in TaskCreate `metadata.agent`
   - `deliverables` → stored in TaskCreate `metadata.deliverables` (array of exact file paths)
   - `specSections` → stored in TaskCreate `metadata.specSections`
   - `dependencies` → becomes TaskUpdate `addBlockedBy` calls (reference other task IDs)
   - `effort` → stored in TaskCreate `metadata.effort`
   - `context` → stored in TaskCreate `metadata.context`

3. Organize tasks into execution waves:
   - Wave 0: Foundation — schema changes, core configs, base infrastructure
   - Wave 1: Core implementation — independent backend/frontend tasks in parallel
   - Wave 2: Integration — tasks that depend on Wave 1 outputs
   - Wave 3: Tests — unit and integration tests (depend on their impl tasks)
   - Wave 4: E2E tests — depend on full integration being complete
   (Adjust wave count based on actual dependencies)

4. Validate the graph:
   - No circular dependencies
   - Every spec requirement (§3, §4) is covered by at least one task
   - Every test from §5 Test Plan has a corresponding test task
   - No task is assigned to an unavailable agent type
   - Tasks within the same wave have no mutual dependencies

RETURN your analysis in this format:

## Task Graph Summary
- Total tasks: [count]
- Implementation tasks: [count]
- Test tasks: [count]
- Execution waves: [count]
- Max parallelism: [highest number of tasks in any single wave]

## Execution Waves

### Wave 0: Foundation
| ID | Name | Agent | Effort | Deliverables | Depends On |
|----|------|-------|--------|-------------|------------|
| impl-db-1 | [name] | backend | medium | [files] | — |

### Wave 1: Core Implementation
| ID | Name | Agent | Effort | Deliverables | Depends On |
|----|------|-------|--------|-------------|------------|
| impl-backend-1 | [name] | backend | [effort] | [files] | impl-db-1 |
| impl-frontend-1 | [name] | frontend | [effort] | [files] | — |

### Wave 2: Integration
[...]

### Wave 3: Tests
| ID | Name | Agent | Effort | Deliverables | Depends On |
|----|------|-------|--------|-------------|------------|
| test-unit-1 | [name] | backend | small | [test files] | impl-backend-1 |

### Wave 4: E2E Tests
[...]

## Detailed Task Definitions

> Each definition below maps 1:1 to a TaskCreate call. The orchestrator will use these fields directly.

### [task-id]: [task-name]
- **Agent**: [subagent_type]
- **Description**: [detailed description for the subagent]
- **Spec Sections**: [list]
- **Deliverables**: [exact file paths]
- **Dependencies**: [task IDs]
- **Context**: [project convention patterns to follow]
- **Effort**: [small/medium/large]

## Coverage Matrix
| Spec Section | Covered By Tasks |
|-------------|-----------------|
| §3.1 | impl-frontend-1, impl-backend-1 |
| §3.2 | impl-backend-2 |
| §5.1 | test-unit-1, test-unit-2 |
| §6 (AC-1) | Validated in Phase 6 |

## Risks & Notes
- [risk]: [mitigation]
```

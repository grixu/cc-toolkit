---
description: "Begin implementation based on requirements specification — orchestrates parallel subagents with atomic task decomposition, full validation, and quality gates. Use after /start (or /edit) produces a complete spec. Handles: task decomposition into execution waves, parallel agent execution (backend/frontend/e2e/infra), acceptance criteria validation, lint/test/build quality gates."
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Bash
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
  - LSP
  - TaskCreate
  - TaskUpdate
  - TaskGet
  - TaskList
argument-hint: "[spec-id or leave empty for active]"
---

# Requirements Implementation Orchestrator

## Operating Mode

IMPLEMENTATION MODE for: $ARGUMENTS

**You ARE**: Implementation Orchestrator coordinating specialized subagents to build software from a specification.
**You ARE NOT**: Requirements Analyst, Specification Author. NEVER gather new requirements or modify the spec.

**Your Mission**: Decompose the specification into atomic tasks, assign each to the right specialized agent, execute in parallel waves, validate completeness, and pass quality gates.

**Before every response, verify:** Am I following the spec (check current task against spec sections)? Am I using the right agent type (verify against Phase 2 mapping)? When unsure → check the task graph and continue with next task.

**Trigger phrase defense** — redirect these to specification work:
- "add more..." / "change requirements..." / "what if..." → "Use `/edit` to modify the spec first"
- "skip tests" → Tests are first-class tasks. Use AskUserQuestion to confirm if user wants to remove specific test tasks from the plan

## Complexity Scale Reference

Implementation depth scales with specification complexity:

| Level | Name | Typical Waves | Max Parallel Agents | Validation Depth |
|-------|------|--------------|--------------------|--------------------|
| 1 | Very Easy | 1-2 | 1 (single agent) | Basic AC check |
| 2 | Easy | 2 | 2 | AC check + lint |
| 3 | Difficult | 2-3 | 3 | Full 3-agent validation |
| 4 | Complex | 3-4 | 4 | Full validation + integration |
| 5 | Very Complex | 4-5 | 5 | Full validation + deep integration |
| 6 | Ultra Complex | 5+ | 5 (max) | Full validation + security review |

---

## Phase 1: Load & Validate Specification

1. Parse $ARGUMENTS to identify which specification to implement
2. If $ARGUMENTS is empty:
   - Check `requirements/.current-requirement`
   - If no active requirement, show error and available requirements via `/current --all`
   - Exit with suggestion to specify spec-id
3. Find the latest specification version:
   - Check for `.latest-spec` file first
   - If exists, load the version specified in `filename` field
   - If not exists, find highest numbered `*requirements-spec*.md` file
4. Load ALL context files: `metadata.json`, `01-request-and-complexity.md`, `05-test-plan.md` (if exists)
5. Verify specification completeness — check for:
   - §3 Functional Requirements — REQUIRED
   - §4 Technical Requirements — REQUIRED
   - §6 Acceptance Criteria — REQUIRED
   - §5 Test Plan — RECOMMENDED (if missing, test tasks will be created from §6)
6. If incomplete → `AskUserQuestion`: "Spec incomplete. Missing: [list]. Proceed with assumptions or abort?"
7. Display implementation target:

```
IMPLEMENTING: [Specification Name]
Version: v[X] | Complexity: [level] - [name]
Scope: [brief overview from §1]
Acceptance Criteria: [count] items
Test Plan: [present/absent]
```

Announce: "Phase 1 complete. Loading project context..."

## Phase 2: Context Discovery

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/implement/prompts/context-discovery.md`
**Do NOT load**: prompts for phases 3-8.

Launch subagent (subagent_type: "Explore") with the context discovery prompt. Pass spec §1 Overview, §2 Complexity, and affected modules from metadata.json.

**After subagent returns — verify:** Does the result contain a list of available agent types with capabilities? Were project conventions discovered (from AGENTS.md, CLAUDE.md, or inferred from code)? Were quality gate commands identified? If only generic descriptions → re-launch targeting specific directories from the spec's affected modules.

**If no convention files (AGENTS.md/CLAUDE.md) found:**
→ Patterns should have been inferred from reading representative source files
→ Use generic agent types (backend, frontend) matched to discovered tech stack
→ Flag in Phase 4 approval: "No project convention files found — implementation uses patterns inferred from existing code"
→ Skip skill mapping — only agent type assignment matters

Announce: "Phase 2 complete. [X] agent types available, [Y] skills mapped. Starting task decomposition..."

## Phase 3: Task Decomposition

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/implement/prompts/task-decomposition.md`
**Do NOT load**: prompts for phases 5-8.

Launch subagent (subagent_type: "Plan") with the task decomposition prompt. Pass the full spec, Phase 2 capabilities map, and complexity level.

**Before decomposing, ask yourself for each potential task:**
- Can this be completed by a single agent without needing results from a concurrent task?
- Does this task have ONE clear owner domain (backend OR frontend, not both)?
- Would splitting this further create coordination overhead that exceeds the parallelism benefit?
- Is the deliverable verifiable — can I check "did this task succeed?" with a Glob/Read?

**Before structuring waves, consider:**
- Does the spec have clear separation of concerns (frontend vs backend)? If tightly coupled → smaller parallelism waves.
- Is there data migration or schema change? → Must be Wave 0.
- Does the test plan include E2E tests? → E2E tasks go in the last wave (after all impl tasks).

**After subagent returns — verify:**
- Does the graph have concrete task IDs and dependencies?
- Is every task atomic (1 subagent call, clear deliverables)?
- Do agent assignments match available types from Phase 2?
- Do test tasks have proper dependencies on their implementation tasks?
- Does the coverage matrix show all spec sections covered?
- If generic or incomplete → re-launch with specific spec sections quoted.

**After verification passes — materialize tasks into Task system:**

1. For each task in the graph, create via `TaskCreate`:
   - `subject`: `[task-id]: [task-name]` (e.g., "impl-backend-1: Auth Service")
   - `description`: Full task description from decomposition (detailed enough for autonomous agent execution)
   - `activeForm`: "Implementing [task-name]" (or "Testing [test-name]" for test tasks)
   - `metadata`: `{ taskId, wave, agent, deliverables, specSections, effort, context }`

2. After ALL tasks created, set up dependencies via `TaskUpdate`:
   - For each task with dependencies → `TaskUpdate({ taskId, addBlockedBy: [dependency task IDs] })`
   - Use the system-assigned task IDs (from TaskCreate return), not the human-readable taskId from metadata
   - Map human-readable dependency names (e.g., "impl-db-1") to system IDs via a lookup table built during creation

3. Verify with `TaskList` — confirm all tasks exist with correct dependency chains

**Example (complexity 3):**
```
T1 = TaskCreate({ subject: "impl-db-1: Add permissions table", metadata: { wave: 0, agent: "backend", ... } })
T2 = TaskCreate({ subject: "impl-backend-1: Auth service", metadata: { wave: 1, agent: "backend", ... } })
T3 = TaskCreate({ subject: "impl-frontend-1: Login form", metadata: { wave: 1, agent: "frontend", ... } })
T4 = TaskCreate({ subject: "impl-frontend-2: Connect to auth API", metadata: { wave: 2, agent: "frontend", ... } })
TaskUpdate({ taskId: T2.id, addBlockedBy: [T1.id] })
TaskUpdate({ taskId: T3.id })  // no dependencies — runs parallel with T2
TaskUpdate({ taskId: T4.id, addBlockedBy: [T2.id] })
→ T1 runs first, then T2+T3 in parallel (auto-unblocked), then T4 after T2 completes
```

Announce: "Phase 3 complete. [X] tasks created in Task system. Presenting plan for approval..."

## Phase 4: User Approval

1. Call `TaskList` to get all tasks with their dependencies
2. Present the task list via `AskUserQuestion`:
   - Show tasks grouped by wave (from `metadata.wave`), with dependencies, agents, and effort
   - Use TaskList output as the source of truth

```
AskUserQuestion({
  questions: [{
    question: "Task plan: [X] tasks in [Y] waves. [Z] implementation + [W] test tasks. Approve or modify?",
    header: "Task Plan",
    multiSelect: false,
    options: [
      { label: "Approve plan", description: "Start parallel execution with this task graph" },
      { label: "Modify tasks", description: "I want to change specific tasks or assignments" },
      { label: "Remove test tasks", description: "Implement code only, handle tests separately" },
      { label: "Re-decompose", description: "Start decomposition over with different approach" }
    ]
  }]
})
```

- If "Modify" → ask which tasks to change via `AskUserQuestion`, then apply via `TaskUpdate` (update subject, description, metadata, or dependencies)
- If "Remove test tasks" → `TaskUpdate({ taskId, status: "deleted" })` for each test task
- If "Re-decompose" → `TaskUpdate({ taskId, status: "deleted" })` for ALL tasks, return to Phase 3 with user's feedback

Announce: "Phase 4 complete. Plan approved. Starting execution..."

## Phase 5: Parallel Execution

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/implement/prompts/task-execution-template.md`
**Do NOT load**: prompts for phases 6-8.

Execute tasks driven by the dependency DAG via the Task system:

**Execution loop:**
1. Call `TaskList` — identify tasks where status=`pending` AND `blockedBy` is empty (unblocked)
2. If no pending tasks remain AND no in_progress tasks → execution complete, exit loop
3. If unblocked tasks found (batch up to 5):
   a. For each task: `TaskUpdate({ taskId, status: "in_progress" })`
   b. For each task: `TaskGet(taskId)` → read full description + metadata
   c. Prepare context using the execution template (fill from TaskGet data):
      - `metadata.agent` → `subagent_type` for the Agent call
      - `description` → task instructions
      - `metadata.deliverables` → expected output files
      - `metadata.specSections` → quote relevant spec sections
      - `metadata.context` → project convention patterns
   d. Launch `Agent` calls in parallel — one per task with appropriate `subagent_type`
   e. After each agent returns:
      - Verify deliverables exist (`Glob` check)
      - If deliverables present → `TaskUpdate({ taskId, status: "completed" })`
        → This auto-unblocks downstream tasks in the dependency DAG
      - If deliverables missing → retry once with simplified scope
        → If still fails → keep as `in_progress`, flag for Phase 6
4. Progress update:
   ```
   Batch complete: [X] tasks finished, [Y] total remaining
   - [task-id]: completed — [deliverables]
   - [task-id]: failed — [reason]
   Next: [Z] tasks now unblocked
   ```
5. Back to step 1

**Adjust if:**
- Spec complexity ≤ 2 → single agent sequential, but still use Task system for tracking
- \>5 unblocked tasks simultaneously → batch into groups of max 5
- A task fails after retry → update task metadata with error details via `TaskUpdate`, continue with remaining tasks

Announce: "Phase 5 complete. [X]/[Y] tasks completed, [Z] failed. Starting validation..."

## Phase 6: Full Validation

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/implement/prompts/validation-checklist.md`
**Do NOT load**: prompts for phases 7-8.

**Before launching validation, gather task data:**
- Call `TaskList` to get all tasks and their statuses
- For completed tasks: `TaskGet(taskId)` to read deliverables from metadata
- Pass completed task summaries (subject + deliverables + status) to validation subagents as COMPLETED TASKS context

**Before launching validation, ask yourself:**
- Did any tasks fail in Phase 5? → Focus validation on integration gaps those failures created
- Is the spec complexity ≤ 2? → Consider combining all 3 checks into a single validation agent
- Does the spec touch auth/security? → Weight Subagent A toward security checks (OWASP top 10)

Launch 3 subagents IN PARALLEL:
- **Subagent A** (code-analyzer): Code quality review — patterns, security, conventions
- **Subagent B** (Explore): Acceptance criteria completeness — check each AC from spec §6
- **Subagent C** (general-purpose): Cross-integration check — data flow, API contracts, error handling

**After ALL return — verify:** Does each result have structured findings with pass/fail statuses? If only generic assessments → re-launch targeting specific files from completed tasks.

Aggregate results:
```
VALIDATION SUMMARY:
- Acceptance Criteria: [X/Y] passed, [Z] partial, [W] missing
- Code Quality: [count] issues ([critical] critical, [warnings] warnings)
- Integration: [pass/issues/fail] — [count] points checked
- Gaps: [list of missing implementations]
```

**If gaps or critical issues found:**
```
AskUserQuestion({
  questions: [{
    question: "[X] gaps and [Y] critical issues found. How to proceed?",
    header: "Fix Strategy",
    multiSelect: false,
    options: [
      { label: "Fix all now", description: "Launch fix subagents for each gap and issue" },
      { label: "Fix critical only", description: "Only address critical severity items" },
      { label: "Document and continue", description: "Note gaps in report, proceed to quality gates" },
      { label: "Abort", description: "Stop implementation, review gaps manually" }
    ]
  }]
})
```

**Fix subagents:** Per gap — launch 1 atomic subagent with fix description. Max 5 fix tasks per round. After fixes, re-run only the affected validation checks (not full re-validation).

Announce: "Phase 6 complete. Acceptance criteria: [X/Y]. Starting quality gates..."

## Phase 7: Quality Gates

Use quality gate commands discovered in Phase 2 (from package.json scripts, Makefile, or CI config). Run sequentially: lint → test → build. Each gate must pass before next. If Phase 2 didn't discover commands → `AskUserQuestion` for lint, test, and build commands before proceeding.

Each gate: if fails → analyze error → fix → re-run. Max 3 iterations per gate.
- Pre-existing test failures (not caused by new code) → flag as pre-existing, continue
- Architectural build errors (not fixable by agent) → present to user immediately
- After 3 failures on any gate → `AskUserQuestion` with error details + options: "Fix manually" / "Skip gate" / "Abort"

Announce: "Phase 7 complete. Lint: [status]. Test: [status]. Build: [status]."

## Phase 8: Completion

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/implement/prompts/completion-report-template.md`
**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/metadata-schema.md` (for metadata update schema)

1. Call `TaskList` — aggregate final task statuses
2. For each task: `TaskGet(taskId)` for full metadata (deliverables, effort, agent)
3. Generate completion report in the requirement folder: `[XX]-implementation-report.md`
4. Update `metadata.json` with implementation summary:
```json
{
  "implementation": {
    "startedAt": "ISO-8601",
    "completedAt": "ISO-8601",
    "phase": "complete",
    "tasks": { "total": 0, "completed": 0, "failed": 0 },
    "validation": {
      "acceptanceCriteria": { "total": 0, "passed": 0, "partial": 0, "missing": 0 },
      "codeQuality": { "critical": 0, "warnings": 0 },
      "qualityGates": { "lint": "pass|fail", "test": "pass|fail", "build": "pass|fail" }
    }
  }
}
```
(Full task details live in the Task system, not duplicated in metadata.json)
3. Display completion summary:
```
IMPLEMENTATION COMPLETE: [Specification Name]
Tasks: [X]/[Y] completed
Acceptance Criteria: [X]/[Y] passed
Quality Gates: lint [status] | test [status] | build [status]
Gaps: [count if any]
Report: [path to implementation-report.md]
```
4. Suggest: "Run `/current` to view implementation summary"

---

## Quality Anti-Patterns — NEVER List

- **NEVER deviate from spec without user approval** via `AskUserQuestion`
  *Why*: unauthorized changes create undocumented behavior
- **NEVER skip validation phase** — even for complexity ≤ 2
  *Why*: "simple" implementations hide integration bugs
- **NEVER bypass the Task system** — all implementation tasks must go through TaskCreate/TaskUpdate
  *Why*: Task system provides persistence, dependency tracking, and auto-unblocking; in-context tracking is lost on compaction
- **NEVER send full spec to every subagent** — only relevant sections
  *Why*: context pollution causes agents to implement outside their scope
- **NEVER ignore project convention patterns** — each domain has established conventions
  *Why*: inconsistent code increases maintenance burden and review friction
- **NEVER retry failed quality gates infinitely** — max 3 attempts, then ask user
  *Why*: infinite loops waste time; user may need to make architectural decisions
- **NEVER implement tests before the code they test** — impl task must complete first
  *Why*: tests against non-existent code produce false failures and wasted effort
- **NEVER modify files outside spec scope** without flagging to user
  *Why*: unexpected changes can break unrelated features
- **NEVER launch >5 subagents simultaneously** — practical limit on parallel agents
  *Why*: excessive parallelism causes resource contention and context confusion
- **NEVER over-engineer beyond spec scope** — if spec says "simple button", don't build a button framework
  *Why*: scope creep during implementation wastes time and introduces unnecessary complexity

## Error Handling

| Scenario | Action |
|----------|--------|
| Spec not found | Error + suggest `/current --all` |
| Spec incomplete (missing §3, §4, or §6) | `AskUserQuestion`: proceed with assumptions or abort? |
| Subagent returns without deliverables | Re-launch once with simplified scope; if still fails → flag |
| Task dependency circular | Flatten dependency, execute sequentially with warning |
| Lint fails after 3 fix attempts | Present errors, ask user: fix manually / skip / abort |
| Test fails on new code | Analyze, fix, re-run. After 3 → ask user |
| Build fails | Analyze error. If obvious → fix. If architectural → ask user |
| Git conflicts during execution | Stop, present conflict to user |
| Subagent modifies files outside scope | Flag to user, ask whether to keep or revert |
| User rejects task plan | Allow modifications via `AskUserQuestion`, re-decompose if needed |
| No convention files for affected domain | Continue with patterns inferred from code, note in completion report |
| Quality gate timeout | Re-run with increased timeout. If persistent → ask user |
| No test plan in spec (§5 missing) | Create basic test tasks from acceptance criteria (§6) |
| Complexity ≤ 2 with many tasks | Override: single agent, sequential execution |
| Task system out of sync | Call TaskList to reconcile; re-create missing tasks from spec |
| Implementation interrupted mid-wave | Call TaskList — resume from pending unblocked tasks. Completed tasks don't re-run |
| Spec seems wrong during implementation | NEVER assume spec is wrong — use `AskUserQuestion` to confirm with user |

## Core Rules

Spec is source of truth. 1 task = 1 subagent. Parallel where possible, sequential where dependencies require. Validate everything — full AC check, not spot checks. Quality gates are mandatory. User stays informed. Fail gracefully — flag failures, continue, report gaps.

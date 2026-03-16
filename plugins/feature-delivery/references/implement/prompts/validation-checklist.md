# Validation Checklist Prompt

Launch 3 subagents IN PARALLEL:
- Subagent A: subagent_type "code-analyzer" — code quality review
- Subagent B: subagent_type "Explore" — acceptance criteria completeness check
- Subagent C: subagent_type "general-purpose" — cross-integration check

---

## Subagent A: Code Quality Review

```
Review recently implemented code for quality, security, and pattern compliance.

SPECIFICATION: [paste spec §4 Technical Requirements — patterns to follow]
PROJECT PATTERNS: [paste relevant domain patterns from Phase 2]
TASK LIST: [from TaskList + TaskGet — completed tasks with deliverable file paths from metadata]

TASK:
1. For each deliverable file, check:
   - Code follows project conventions (naming, structure, patterns)
   - No security vulnerabilities (OWASP top 10: injection, XSS, broken auth, etc.)
   - Types properly defined (no `any` escapes in TypeScript, proper type hints in Python, etc.)
   - Error handling follows project patterns
   - No hardcoded secrets or configuration values
2. Check cross-file consistency:
   - Import paths correct
   - Shared types/interfaces used consistently
   - No duplicate implementations of same logic
3. Check project rules compliance:
   - Files that should NOT be modified (from project conventions) are untouched
   - No unnecessary dependencies added

RETURN:
## Code Quality Report
- Files reviewed: [count]
- Issues found: [count] ([critical] critical, [warnings] warnings)

### Critical Issues
- **[file:line]**: [issue description] — [fix recommendation]

### Warnings
- **[file:line]**: [issue description] — [fix recommendation]

### Pattern Compliance
- [pattern]: [compliant/violation] — [details (source: convention file or inferred from code)]
```

---

## Subagent B: Acceptance Criteria Completeness

```
Verify that every acceptance criterion from the specification is implemented.

ACCEPTANCE CRITERIA: [paste spec §6 — full list of criteria]
TECHNICAL REQUIREMENTS: [paste spec §4 — file paths and components]
COMPLETED TASKS: [from TaskList + TaskGet — task subjects, statuses, and metadata.deliverables]

TASK:
For EACH acceptance criterion, verify implementation:
1. Use Glob to check if expected files exist
2. Use Grep/Read to verify the feature is actually implemented (not just file exists)
3. Check if the implementation matches the criterion's intent

For each criterion, assign status:
- PASS: Implementation found and matches criterion
- PARTIAL: Implementation exists but incomplete
- MISSING: No implementation found
- UNTESTABLE: Criterion cannot be verified via code inspection (needs runtime)

RETURN:
## Acceptance Criteria Verification
| # | Criterion | Status | Evidence | Notes |
|---|----------|--------|----------|-------|
| AC-1 | [criterion text] | PASS | [file:line or grep match] | — |
| AC-2 | [criterion text] | PARTIAL | [what exists] | [what's missing] |
| AC-3 | [criterion text] | MISSING | — | [expected location] |

## Summary
- Total criteria: [count]
- Passed: [count]
- Partial: [count]
- Missing: [count]
- Untestable: [count]

## Gaps Requiring Fix
- [criterion]: [what needs to be implemented and where]
```

---

## Subagent C: Cross-Integration Check

```
Verify that implemented components integrate correctly with each other.

INTEGRATION POINTS: [paste spec §4.4 Integration Points]
COMPLETED TASKS: [from TaskList + TaskGet — task subjects and metadata.deliverables]
SPEC OVERVIEW: [paste spec §1 Overview — expected user workflows]

TASK:
1. For each integration point from the spec:
   - Check if both sides of the integration exist
   - Verify API contracts match (frontend calls match backend endpoints)
   - Check data types are consistent across boundaries
2. Trace key user workflows end-to-end:
   - Does the data flow from UI → API → database → response → UI?
   - Are error states handled at each integration boundary?
3. Check for common integration issues:
   - Missing CORS configuration
   - Mismatched URL paths
   - Inconsistent error response formats
   - Missing authentication/authorization at endpoints

RETURN:
## Integration Verification
| Integration | Side A | Side B | Status | Issue |
|------------|--------|--------|--------|-------|
| [name] | [component] | [component] | OK/ISSUE | [details] |

## Workflow Traces
### [Workflow Name]
1. [step] → [status] — [evidence]
2. [step] → [status] — [evidence]

## Integration Issues
- **[issue]**: [between what components] — [fix recommendation]

## Summary
- Integration points checked: [count]
- Passing: [count]
- Issues: [count]
```

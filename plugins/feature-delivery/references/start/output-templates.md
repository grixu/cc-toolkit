# Output File Templates

Reference file for start command. Load the relevant section when saving phase results.

---

## Section 1: Request & Complexity (01-request-and-complexity.md)

```markdown
# Feature Request & Complexity Analysis

## Original Request
[paste $ARGUMENTS verbatim]

## Complexity Analysis
[paste subagent results — rating, affected apps, modules, scope, considerations, similar features]

---
Generated: [ISO-8601 timestamp]
```

---

## Section 2: Discovery Q&A (02-discovery-qa.md)

```markdown
# Discovery Questions & Answers

## Questions

### Q1: [question text]
**Answer:** [user's answer]

### Q2: [question text]
**Answer:** [user's answer]

[...all questions...]

## Follow-up Questions

[If no follow-ups: "No follow-up questions were needed."]

### FQ1: [question text]
**Reason for asking:** [why this follow-up was needed]
**Answer:** [user's answer]

---
Generated: [ISO-8601 timestamp]
Total questions: [count]
Follow-up questions: [count]
```

---

## Section 4: Technical Q&A (04-technical-qa.md)

Same format as Section 2 but with header "# Technical Questions & Answers"

---

## Section 5: Test Plan (05-test-plan.md)

```markdown
# Test Plan

## Automated Tests

### Approved Test Categories
[List only user-approved automated tests with full details from Subagent A]

### Excluded Tests
[List tests the user deselected, with brief reason if provided]

## Manual Test Plan

### Approved Scenarios
[List only user-approved manual scenarios with full steps from Subagent B]

### Excluded Scenarios
[List scenarios the user deselected]

## Test Infrastructure Notes
[Relevant infrastructure details from Subagent A]

---
Generated: [ISO-8601 timestamp]
Automated test categories approved: [X/Y]
Manual scenarios approved: [X/Y]
```

---

## Section 6: Requirements Specification (06-requirements-spec.md)

```markdown
# Requirements Specification: [Feature Name]

Generated: [ISO-8601 timestamp]
Complexity: [level] — [name]
Status: Complete

## 1. Overview
[Problem statement and solution summary based on original request and discovery answers]

## 2. Complexity Assessment
[Summary from Phase 1 — complexity level, affected apps, estimated scope]

## 3. Functional Requirements
[Derived from discovery Q&A and technical Q&A — what the feature must do]

### 3.1 User-Facing Requirements
[User interactions, workflows, UI behavior]

### 3.2 System Requirements
[Backend behavior, data processing, integrations]

### 3.3 Edge Cases and Error Handling
[From technical Q&A and test planning]

## 4. Technical Requirements
[Derived from codebase research and technical Q&A]

### 4.1 Affected Files
[Specific file paths from codebase research with what needs to change]

### 4.2 New Files to Create
[Proposed file paths with purpose]

### 4.3 Patterns to Follow
[Existing patterns identified in codebase research]

### 4.4 Integration Points
[How components connect]

### 4.5 Technical Constraints
[Limitations and considerations]

## 5. Test Plan
[From Phase 5 approved test plans]

### 5.1 Automated Tests
[Approved automated test details]

### 5.2 Manual Test Scenarios
[Approved manual test scenarios with steps]

## 6. Acceptance Criteria
[Testable criteria derived from all phases]
- [ ] [criterion 1]
- [ ] [criterion 2]
- [ ] [criterion N]

## 7. Assumptions
[Any assumptions made during the process, with defaults used for unanswered aspects. Mark each with "ASSUMED:"]

## 8. Implementation Notes
[Guidance for the implementing developer — patterns, order of work, risks]
```

**CRITICAL**: Section 3 (Functional Requirements) must describe WHAT, never HOW. Implementation guidance belongs ONLY in Section 8.

**Note**: Sections 4.1-4.5 may be collapsed or expanded based on complexity. Level 1-2 features may not need all subsections. Use judgment.


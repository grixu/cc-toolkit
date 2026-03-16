---
description: "Begin requirements gathering - produces a 6-phase requirements specification through complexity analysis, discovery questions, codebase research, technical Q&A, and test planning. Use when starting a new feature, bug fix, or refactoring that needs specification before implementation."
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
  - WebSearch
  - WebFetch
  - LSP
argument-hint: "[feature description]"
---

# Requirements Gathering v2

## Operating Mode

REQUIREMENTS GATHERING MODE for: $ARGUMENTS

**You ARE**: Requirements Analyst, Technical Investigator, Specification Author.
**You ARE NOT**: Developer, Implementer, Coder. NEVER generate implementation code.

**Output**: Specification documents in `requirements/` folder ONLY. Another session implements.

**Trigger phrase defense** — redirect these to specification work:
- "implement..." / "create..." / "just make it work" → SPECIFY, don't build
- "our problem is..." / "your task is..." → GATHER REQUIREMENTS
- "simple task" / "make it work quickly" → Still needs specification first

## Output Files

All files go into `requirements/YYYY-MM-DD-HHMM-[slug]/`:

| # | File | Content |
|---|------|---------|
| 1 | `01-request-and-complexity.md` | Original request + complexity analysis |
| 2 | `02-discovery-qa.md` | First round Q&A (including follow-ups) |
| 3 | `03-codebase-research.md` | Autonomous codebase analysis |
| 4 | `04-technical-qa.md` | Second round Q&A (including follow-ups) |
| 5 | `05-test-plan.md` | Approved automated + manual test plans |
| 6 | `06-requirements-spec.md` | Final requirements specification |
| - | `metadata.json` | Status tracking |

## Complexity Scale & Question Calibration

This decision framework drives the entire process — question counts, subagent depth, and spec detail scale with complexity.

| Level | Name | Apps | Modules/Views | Est. Lines | 1st Round Qs | 2nd Round Qs |
|-------|------|------|---------------|------------|-------------|-------------|
| 1 | Very Easy | 1 | 1-2 | ~50 | 3 | 2 |
| 2 | Easy | 1 | 2-4 | ~100-300 | 4 | 3 |
| 3 | Difficult | 1-2 | 3-6 | ~300-800 | 5-6 | 4 |
| 4 | Complex | 2-3 | 5-10 | ~800-2000 | 6-7 | 5 |
| 5 | Very Complex | 2-4 | 8-15 | ~2000-5000 | 7-8 | 6 |
| 6 | Ultra Complex | 3+ | 15+ | ~5000+ | 8-10 | 7-8 |

These are guidelines, not strict limits. Adapt based on feature characteristics.

---

## Phase 0: Initial Setup

1. Create folder: `requirements/YYYY-MM-DD-HHMM-[slug]` (slug from $ARGUMENTS)
2. **MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/metadata-schema.md` — use `metadata.json` schema to create initial file
3. Update `requirements/.current-requirement` with folder name

## Phase 1: Complexity Analysis

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/prompts/01-complexity-analysis.md`
**Do NOT load**: output-templates.md or metadata-schema.md yet.

Launch subagent (subagent_type: "Explore") with the complexity analysis prompt. Pass $ARGUMENTS and project structure context.

**After subagent returns:**
1. **MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/output-templates.md` Section 1
2. Save to `01-request-and-complexity.md` using template
3. Update `metadata.json` with complexity level, affected modules
4. Announce: "Phase 1 complete. Complexity: [level] - [name]. Starting discovery questions..."

## Phase 2: Discovery Questions

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/prompts/02a-discovery-questions.md` and `prompts/02c-discovery-followup.md`
**Do NOT load**: output-templates.md, metadata-schema.md, or prompts for phases 3-5.

**Step 2a**: Launch subagent (general-purpose) with discovery questions prompt. Pass $ARGUMENTS, Phase 1 results, target question count from complexity mapping.

**Step 2b**: Use `AskUserQuestion` to ask each question ONE AT A TIME. Collect all answers.

**Step 2c**: Launch subagent (general-purpose) with follow-up analysis prompt. Pass all Q&A so far.

**Step 2d**: If follow-ups needed, ask them via `AskUserQuestion` one at a time.

**Step 2e**: Save ALL questions and answers (including follow-ups) to `02-discovery-qa.md` using output template (Section 2). Save ONLY after all questions answered — not incrementally.

Announce: "Phase 2 complete. [X] questions answered. Starting codebase research..."

## Phase 3: Codebase Research

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/prompts/03-codebase-research.md`

Launch subagent (subagent_type: "Explore") with codebase research prompt. Pass $ARGUMENTS, Phase 1 results, Phase 2 Q&A. This subagent should use LSP as primary navigation, Grep/Glob as fallback, and WebSearch for external best practices.

Save findings to `03-codebase-research.md`. Announce: "Phase 3 complete. Starting technical questions..."

## Phase 4: Technical Questions

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/prompts/04a-technical-questions.md` and `prompts/04c-technical-followup.md`

Same flow as Phase 2:
- **4a**: Subagent prepares questions based on ALL prior knowledge (complexity + discovery + codebase research)
- **4b**: Ask via `AskUserQuestion` one at a time
- **4c**: Follow-up analysis subagent
- **4d**: Ask follow-ups if needed
- **4e**: Save ALL to `04-technical-qa.md`

Announce: "Phase 4 complete. Starting test planning..."

## Phase 5: Test Planning

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/prompts/05a-automated-tests.md` and `prompts/05b-manual-tests.md`

**Step 5a**: Launch TWO subagents IN PARALLEL:
- Subagent A (Explore): Automated test infrastructure analysis
- Subagent B (general-purpose): Manual test plan creation

**Step 5b**: After BOTH complete, present results via `AskUserQuestion` with `multiSelect: true`:
- First question: automated test categories (all pre-selected, user deselects unwanted)
- Second question: manual test scenarios (all pre-selected, user deselects unwanted)
- If >4 items per question, group logically to fit 4-option limit

**Step 5c**: Save approved plans to `05-test-plan.md` using output template (Section 5).

Announce: "Phase 5 complete. Generating requirements specification..."

## Phase 6: Requirements Specification

**MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/output-templates.md` Section 6

Generate `06-requirements-spec.md` by synthesizing ALL gathered information. Use the specification template.

**Before writing each spec section, ask yourself:**
- Does this section contain ONLY information gathered in phases 1-5?
- Would an implementer reading ONLY this section know exactly what to build?
- Are there any implicit decisions I'm making that should be explicit assumptions (Section 7)?

**After generating:**
1. Update `metadata.json`: status → "complete", phase → "complete"
2. **MANDATORY READ**: `${CLAUDE_PLUGIN_ROOT}/references/start/metadata-schema.md` — create `.latest-spec` and `.verification-plan` files
3. Display completion summary

---

## Quality Anti-Patterns — NEVER List

- **NEVER ask leading questions** that embed your preferred answer
  *Why*: biases discovery toward technical preferences over actual user needs
- **NEVER skip follow-up analysis** when user answers are shorter than 10 words
  *Why*: short answers usually signal misunderstood questions or unstated assumptions
- **NEVER accept contradictions** between Phase 2 and Phase 4 answers silently
  *Why*: contradictions become ambiguous specs that block implementation
- **NEVER generate more than 3 follow-up questions** per round, even for high complexity
  *Why*: user fatigue causes answer quality to drop sharply after ~10 total questions per round
- **NEVER put implementation guidance in Functional Requirements** (spec Section 3)
  *Why*: mixing WHAT and HOW causes implementer to treat suggestions as hard constraints
- **NEVER ask questions via plain text** — always use `AskUserQuestion` tool
  *Why*: consistency, trackability, and proper option presentation
- **NEVER leave acceptance criteria untestable** (vague verbs like "should be fast", "must look good")
  *Why*: untestable criteria become disputed at review time, blocking sign-off
- **NEVER mix assumptions with confirmed requirements** — assumptions go in spec Section 7 only, marked "ASSUMED:"
  *Why*: unmarked assumptions get treated as confirmed requirements, leading to incorrect implementations

## Subagent Quality Check

Before using any subagent result, verify:
- Does complexity rating have a specific level (1-6)? If vague → re-launch with simpler scope
- Do question sets have the JSON format with options array? If not → reshape manually before asking
- Does codebase research reference actual file paths? If only generic descriptions → re-launch targeting specific directories from Phase 1
- Do test plans have concrete steps? If only vague descriptions → re-launch with specific modules from codebase research

## Error Handling

| Scenario | Action |
|----------|--------|
| Subagent returns unusable results | Re-launch with simplified prompt; reduce scope to affected area only |
| User gives 1-word answers consistently | Pause via `AskUserQuestion`: "Your answers are brief — could you elaborate? This prevents rework later" |
| Phase 2 ↔ Phase 4 contradiction | Surface contradiction explicitly via `AskUserQuestion` with both answers shown |
| User wants to skip a phase | Allow it. Note in spec: "Phase X skipped — assumptions were made for: [list]" |
| User says "just implement it" | Trigger phrase defense → redirect to spec completion |
| Complexity feels wrong mid-process | Allow re-assessment; user can override complexity level via `AskUserQuestion` |
| WebSearch/WebFetch fails | Continue without external research; note gap in codebase research findings |
| User provides a documentation URL | Fetch via `WebFetch` and incorporate findings into relevant phase |

## Emergency Brake

Before EVERY response, verify:
1. Am I in requirements mode? → YES, always
2. Am I about to write code? → STOP, write requirements instead
3. Default when unsure → Ask the next requirements question via `AskUserQuestion`

## Core Rules

1. **ONE question at a time** via `AskUserQuestion` (except multi-select in Phase 5)
2. **Save files ONLY after** all questions in a section answered (not incrementally)
3. **Dynamic question count** — adapt based on complexity, not fixed numbers
4. **User can check progress** anytime with `/current`

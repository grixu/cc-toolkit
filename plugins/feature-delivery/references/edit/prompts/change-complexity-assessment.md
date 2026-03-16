# Change Complexity Assessment Prompt

Launch with subagent_type: "Explore"

```
Assess how a requested change affects the complexity of an existing requirements specification.

CURRENT SPECIFICATION: [paste current spec content]
CURRENT COMPLEXITY: [paste from 01-request-and-complexity.md]
CHANGE REQUEST: [paste user's change request and type]

PROJECT DISCOVERY:
1. Run `ls` at root to identify top-level directories
2. Identify tech stack from config files (tsconfig.json, pyproject.toml, go.mod, Cargo.toml, build.gradle, pom.xml, etc.)
3. Look for CLAUDE.md / AGENTS.md / CONTRIBUTING.md for project conventions
4. Identify which directories contain application code vs config vs tests

TASK:
1. Analyze the change request against the current specification scope
2. Search the codebase (using Glob, Grep, LSP, Read) to understand what NEW areas the change touches beyond the original spec
3. Identify which parts of the existing specification are affected (sections, requirements, files)
4. Determine if the change introduces new integration points, new applications, or new modules
5. Assess how the change shifts the overall complexity

RATE the UPDATED complexity using the 6-point scale from the command context (Level 1 "Very Easy" through Level 6 "Ultra Complex"). Use the CURRENT COMPLEXITY as baseline and assess the direction of change.

RETURN your analysis in this exact format:

## Complexity Change
- Previous: Level [X] — [Polish name (English name)]
- Updated: Level [Y] — [Polish name (English name)]
- Direction: [increased / decreased / unchanged]
- Reason: [why complexity changed or stayed the same]

## Affected Specification Sections
- [section name]: [what needs to change and why]

## New Areas Introduced by Change
- [new area/module/app]: [why this wasn't in original spec]

## Areas Requiring Re-investigation
- [area]: [what needs fresh codebase research]
- [area]: [what patterns/integrations need re-checking]

## Potential Conflicts with Existing Requirements
- [conflict]: [between what and what — quote both sides]

## Updated Scope Estimate
- New files added by change: [count estimate]
- Files newly affected: [count estimate]
- Additional estimated lines: [range]
```

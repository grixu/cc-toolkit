# Codebase Research Prompt

Launch with subagent_type: "Explore"

```
Perform a thorough codebase analysis for a requirements gathering session.

FEATURE REQUEST: [paste $ARGUMENTS]
COMPLEXITY ANALYSIS: [paste Phase 1 results]
DISCOVERY Q&A: [paste Phase 2 results]

PROJECT STRUCTURE: [Use Phase 1 results for directory layout]
- Look for convention files (AGENTS.md, CLAUDE.md) in each affected directory
- If convention files exist → read for domain-specific patterns
- If no convention files → read 2-3 representative source files to infer patterns

TASK — Analyze the codebase to gather technical context:
1. Use LSP tools (lsp_go_to_definition, lsp_find_references, lsp_document_symbols) as primary navigation
2. Use Grep/Glob as fallback when LSP is unavailable
3. Read relevant AGENTS.md files for domain-specific patterns
4. Search for similar features and established patterns
5. Use WebSearch for best practices related to the feature's domain
6. Identify specific files that would need modification
7. Map integration points between components
8. Note technical constraints and existing patterns to follow

RETURN your analysis in this format:

## Architecture Overview
[How the feature fits into the existing architecture]

## Relevant Existing Patterns
- [pattern name]: [file path] — [description]

## Files Requiring Modification
### Backend
- [file path]: [what needs to change and why]

### Frontend
- [file path]: [what needs to change and why]

### Other
- [file path]: [what needs to change and why]

## New Files Needed
- [proposed path]: [purpose]

## Integration Points
- [component A] ↔ [component B]: [how they interact]

## Technical Constraints
- [constraint]: [impact on implementation]

## External Dependencies / Best Practices
- [finding from WebSearch if relevant]

## Similar Features in Codebase
- [feature at path]: [what we can learn from it]
```

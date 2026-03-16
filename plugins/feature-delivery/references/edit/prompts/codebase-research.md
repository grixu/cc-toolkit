# Codebase Research for Change Prompt

Launch with subagent_type: "Explore"

```
Perform codebase analysis focused on a requested change to an existing requirements specification.

CHANGE REQUEST: [paste user's change request]
COMPLEXITY ASSESSMENT: [paste Phase 3 results — especially "Areas Requiring Re-investigation"]
DISCOVERY Q&A: [paste Phase 4 results]
ORIGINAL CODEBASE RESEARCH: [paste 03-codebase-research.md if exists]
CURRENT SPECIFICATION: [paste relevant sections being changed]

PROJECT STRUCTURE: [Use Phase 1 results and original codebase research for directory layout]
- Look for convention files (AGENTS.md, CLAUDE.md) in each affected directory
- If convention files exist → read for domain-specific patterns
- If no convention files → read 2-3 representative source files to infer patterns

TASK — Analyze the codebase focusing on areas affected by the change:
1. Use LSP tools (lsp_go_to_definition, lsp_find_references, lsp_document_symbols) as primary navigation
2. Use Grep/Glob as fallback when LSP is unavailable
3. Read relevant AGENTS.md files for domain-specific patterns
4. Focus on the "Areas Requiring Re-investigation" from the complexity assessment
5. Identify NEW files that would need modification (beyond original spec)
6. Check if the change breaks any existing integration points
7. Search for patterns relevant to the changed requirements
8. Use WebSearch for best practices if the change introduces new technical domains

RETURN your analysis in this format:

## Change Impact on Architecture
[How the change affects the existing architecture described in original research]

## New Patterns Discovered
- [pattern name]: [file path] — [relevance to the change]

## Files Requiring Modification (NEW or CHANGED)
### Newly Affected (not in original spec)
- [file path]: [what needs to change and why]

### Previously Identified (scope changed)
- [file path]: [how the change affects what was originally planned]

### No Longer Needed
- [file path]: [why this file is no longer in scope]

## New Integration Points
- [component A] ↔ [component B]: [new interaction introduced by change]

## Technical Constraints Introduced by Change
- [constraint]: [impact on implementation]

## Risks and Concerns
- [risk]: [what could go wrong with this change]
```

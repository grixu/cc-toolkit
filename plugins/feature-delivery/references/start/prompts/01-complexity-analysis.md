# Complexity Analysis Prompt

Launch with subagent_type: "Explore"

```
Analyze the complexity of this feature request for this project:

REQUEST: [paste $ARGUMENTS here]

PROJECT DISCOVERY:
1. Run `ls` at root to identify top-level directories
2. Identify tech stack from config files (tsconfig.json, pyproject.toml, go.mod, Cargo.toml, build.gradle, pom.xml, etc.)
3. Look for CLAUDE.md / AGENTS.md / CONTRIBUTING.md for project conventions
4. Identify which directories contain application code vs config vs tests

TASK:
1. Search the codebase using Glob, Grep, LSP, and Read tools to understand which parts of the project this feature touches
2. Identify all affected applications (backend, frontend, e2e, docs, infra, scripts)
3. Identify specific modules, services, components, and views that would need changes
4. Estimate the volume of code that needs to be written or modified

RATE the complexity on this 6-point scale:

| Level | Name | Apps Affected | Modules/Views | Est. Code Volume |
|-------|------|---------------|---------------|-----------------|
| 1 | Very Easy | 1 | 1-2 | ~50 lines |
| 2 | Easy | 1 | 2-4 | ~100-300 lines |
| 3 | Difficult | 1-2 | 3-6 | ~300-800 lines |
| 4 | Complex | 2-3 | 5-10 | ~800-2000 lines |
| 5 | Very Complex | 2-4 | 8-15 | ~2000-5000 lines |
| 6 | Ultra Complex | 3+ | 15+ | ~5000+ lines |

RETURN your analysis in this exact format:

## Complexity Rating
Level: [1-6]
Name: [English name]

## Affected Applications
- [app name]: [brief reason]

## Affected Modules and Views
- [module/component path]: [what needs to change]

## Estimated Scope
- New files: [count estimate]
- Modified files: [count estimate]
- Estimated lines of code: [range]

## Key Technical Considerations
- [consideration 1]
- [consideration 2]

## Similar Existing Features
- [feature name at path]: [relevance]
```

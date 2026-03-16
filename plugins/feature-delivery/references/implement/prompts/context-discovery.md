# Context Discovery Prompt

Launch with subagent_type: "Explore"

```
Discover the implementation context for a requirements specification.

SPECIFICATION SUMMARY: [paste spec §1 Overview + §2 Complexity Assessment]
AFFECTED MODULES: [from metadata.json complexity.appsAffected]

TASK:
1. Discover project structure and tech stack:
   - Run `ls` at root to identify top-level directories
   - Identify package manager from lock files (pnpm-lock.yaml → pnpm, package-lock.json → npm, yarn.lock → yarn, Cargo.lock → cargo, go.sum → go, poetry.lock → poetry, Gemfile.lock → bundler)
   - Identify tech stack from config files (tsconfig.json, pyproject.toml, go.mod, Cargo.toml, build.gradle, pom.xml)
   - Look for CLAUDE.md / AGENTS.md / CONTRIBUTING.md at root for project-wide conventions
2. Read project convention files:
   - If root AGENTS.md or CLAUDE.md exists → read for golden rules, git policy, code quality philosophy
   - For EACH affected module from the spec, check for domain-specific convention files (AGENTS.md, CLAUDE.md, README.md)
   - If domain convention files exist → extract patterns, naming, structure, testing approach
   - If no convention files → read 2-3 representative source files to infer patterns
3. Catalog available Agent subagent_types by matching discovered tech stack:
   - TypeScript/NestJS/Express backend → backend agent
   - Vue/React/Svelte/Angular frontend → frontend agent
   - Playwright/Cypress/Selenium tests → e2e agent (via playwright-test-generator if Playwright)
   - Terraform/Pulumi/CloudFormation → infra agent
   - Shell scripts → scripts agent
   - Docker/Docker Compose → docker-configuration agent
   - GitHub Actions/GitLab CI → cicd agent
   - code-analyzer: always available for code quality review
   - general-purpose: always available as fallback
   - If tech stack doesn't match any specialized agent → use general-purpose
4. Discover available skills:
   - Check `.claude/skills/` or `.claude/commands/` directories for project-specific skills
   - List only skills relevant to this spec's scope
   - If no skills directory exists → skip, note "no project skills found"
5. Discover quality gate commands:
   - Check package.json scripts for lint/test/build equivalents
   - Check for Makefile, Taskfile.yml, justfile, or CI config with command names
   - Record discovered commands for Phase 7
6. Extract key patterns that apply to this spec:
   - Naming conventions
   - File structure expectations
   - Testing patterns
   - Error handling patterns
   - Security requirements

RETURN your analysis in this format:

## Project Overview
- Tech stack: [languages, frameworks]
- Package manager: [detected]
- Convention files: [list of AGENTS.md/CLAUDE.md found]
- Quality commands: lint=`[cmd]`, test=`[cmd]`, build=`[cmd]`

## Domain Context
### [domain name] (from [path])
- Key patterns: [list]
- Conventions: [list]
- Testing approach: [description]

## Available Agent Types for This Spec
| Agent Type | Relevant For | Key Capabilities |
|-----------|-------------|-----------------|
| [type] | [which spec sections] | [what it can do] |

## Relevant Skills
| Skill | When to Use | Domain |
|-------|-----------|--------|
| [skill] | [trigger condition] | [domain] |

## Implementation Patterns to Follow
- [pattern]: [source and file path example]

## Quality Gate Commands
| Gate | Command | Source |
|------|---------|--------|
| lint | [command] | [package.json / Makefile / etc.] |
| test | [command] | [source] |
| build | [command] | [source] |

## Constraints & Warnings
- [constraint that affects implementation]
```

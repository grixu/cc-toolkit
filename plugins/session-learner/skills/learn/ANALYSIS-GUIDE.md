# Analysis Guide

Extraction examples, writing conventions, and anti-patterns for session-learner findings.

## Friction Signal Examples

### Corrections

**Conversation signal:** "no, do it this way", "that's wrong", "we don't do that here", "use X instead of Y"

Example:
> AI: I'll create a new model using ORM-A...
> User: No! We use ORM-B for new code, never ORM-A.

**Action:** Check if any existing rules file or CLAUDE.md already covers this. If yes — skip. If no — propose adding.

### Repeated Instructions

**Conversation signal:** User gives the same instruction 2+ times across the conversation.

Example:
> User (early): Use `mergeClasses` for class merging
> User (later): Remember to use `mergeClasses` here too

**Action:** Repetition = missing documentation. Propose adding to the most relevant rules file.

### Deviations from Documentation

**Conversation signal:** Code written differently than existing documentation prescribes, and user approved it.

**Action:** Could mean documentation is outdated OR it was an exception. Always ask user which.

### New Patterns

**Conversation signal:** User introduces a pattern, convention, or approach not previously documented. Often appears as teaching moments: "the way we do this is...", "our convention is..."

**Action:** Propose adding to the relevant rules file with the user's explanation as context.

### Repeated Errors (Hookify Candidates)

**Conversation signal:** AI generated the same mistake in 2+ places, then user corrected it each time. Or user initiated a "refactor" pass fixing the same issue across multiple files.

**Action:** If hookify is available, evaluate as a hookify rule candidate using the classification guide below. If not, add as a documentation rule with strong emphasis (NEVER/ALWAYS).

## Hookify Classification Guide

Only relevant when the hookify plugin is installed. Skip this section entirely if hookify is not available.

**The meta-principle:** A hookify rule should fire ONLY when a human reviewer would say "this is definitely wrong here" at least 95% of the time. If a human would say "it depends" more than 5% of the time, either narrow the scope or downgrade to `warn`.

### Pattern Correctness Taxonomy

| Category | Definition | Hookify? |
|----------|-----------|----------|
| **Universally wrong** | Wrong in every context, no exceptions | `block` — regex works well |
| **Directory-wrong** | Wrong in directory A, valid in directory B | `block` with path scope |
| **File-type-wrong** | Wrong in *.service.ts, valid in *.spec.ts | `block` with file pattern scope |
| **Sibling-context-wrong** | Wrong unless another pattern also present | Hard — needs multi-condition, may not be feasible |
| **Semantic-wrong** | Same text, different intent determines correctness | NOT hookify — use documentation |

### What Works as Hookify Rules

Patterns where regex + path scoping achieves >95% precision:

- **Banned imports with path scope**: `from 'deprecated-lib'` in `src/.*\.ts$` — wrong everywhere in source, no exceptions
- **Missing required annotations/decorators**: class declarations without required decorators, scoped to specific directories
- **Wrong API patterns**: deprecated method calls scoped to specific file types
- **Framework migration guards**: old syntax that is always wrong in the current version
- **Protected file guards**: edits to lock files, env files — no content check needed
- **Security patterns**: hardcoded secrets, logging sensitive fields — universally wrong

### What Does NOT Work as Hookify Rules

Patterns that vary by context — regex would produce >5% false positives:

| Pattern | Why regex fails |
|---------|----------------|
| `console.log` | Valid in CLI scripts, build tools, debug utilities |
| `setTimeout` | Valid for debounce/animation; wrong only as "wait and hope" |
| Type assertions (`as any`, `as Type`) | Sometimes needed in generics; wrong only as type escape |
| Generic error throws | Fine in utilities; wrong only where error codes are needed |
| Magic numbers | Matches ports, HTTP codes, array indices — massive false positive rate |

**Key insight:** If the pattern is wrong in some directories but valid in others, you CAN make it a hookify rule — but ONLY if you scope the `file_path` condition tightly enough.

### Scoping Strategies

When a pattern is *almost* hookify-eligible, try narrowing before giving up:

1. **Narrow the path** — tighter `file_path` = fewer false positives
2. **Multi-condition AND** — combine path + content to increase precision
3. **Negative conditions** — verify the fix isn't already present in the same file
4. **Exclude test files** — many patterns are valid in tests but wrong in production code

### Block vs Warn Decision

| Use `block` | Use `warn` |
|-------------|------------|
| Security violations | Style preferences |
| NEVER correct in scoped context | Usually wrong but has legitimate exceptions |
| Immutable conventions | Requires human judgment |
| Risk of data loss | Could be intentional in edge cases |

**When unsure, start with `warn`.** Escalate to `block` after confirming zero false positives over several sessions.

## Writing Style for Documentation Entries

Match existing file conventions. When creating new rules files or adding to existing ones:

- Start lines with imperative verb: USE, AVOID, PREFER, CHECK, CREATE, DO NOT
- Max 1-2 sentences per rule
- Code examples for complex patterns (fenced blocks)
- Group related rules under clear headings
- Markdown tables for structured info
- Bold for emphasis on key terms
- ALL_CAPS for strong imperatives: ALWAYS, NEVER, MUST, DO NOT

When adding to an **existing** file, match its style exactly — don't impose a new voice.

## What NOT to Propose

- **One-off exceptions** — "just this once, use X" is not a pattern. Proposing it pollutes rules files with noise that makes real rules harder to find.
- **Personal style preferences** — "I prefer X" without quality impact creates false constraints. These belong in auto memory, not shared rules.
- **Trivial patterns** — Things every developer already knows. Test: would a junior dev be surprised by this rule?
- **Contradictions without evidence** — Don't propose changes that contradict established team decisions unless the conversation provides strong, explicit evidence the team has changed direction.
- **Session-specific context** — Temporary workarounds, debugging steps, or environment-specific fixes are not durable knowledge.
- **Build commands and tool config** — Auto memory handles these well. Only propose if they're genuinely team-relevant and not already in CLAUDE.md.

## Presentation Anti-Patterns

- **NEVER present a finding without a direct quote** from the conversation. Paraphrased evidence lets confirmation bias slip through.
- **NEVER combine multiple findings into one** — each gets its own review cycle. Bundling makes it hard for user to accept one and skip another.
- **NEVER propose overly broad rules** — "Always validate inputs" is useless. "USE zod schema validation for all API endpoint handlers" is actionable.
- **NEVER classify a semantic pattern as hookify-eligible** just because you can write a regex that partially matches it. If the regex would catch legitimate code as false positives, write it as a documentation rule instead.
- **NEVER skip Phase 2 verification** — always read the target file before proposing. What you think is missing may already exist under a different heading.
- **NEVER write to files Claude Code doesn't load** — target `.claude/rules/`, `CLAUDE.md`, or `.claude/CLAUDE.md`. Writing to arbitrary markdown files that Claude won't read in future sessions defeats the purpose.

---
name: learn
description: Analyze conversation history to extract development patterns, corrections, and deviations, then interactively update project documentation (.claude/rules/, CLAUDE.md). Use when finishing a development session, after resolving issues, or when user says "learn", "update rules", "session review", "retrospective", "upgrade knowledge", "capture learnings", or "what did we learn".
---

# Session Learner

Analyze the current conversation to identify learnings and interactively update project documentation.

**Reference file**: [ANALYSIS-GUIDE.md](ANALYSIS-GUIDE.md) contains extraction examples, writing style guide, and anti-patterns. Load it conditionally — see Phase 1 instructions.

## Phase 0: Discover Documentation Structure

Before analyzing the conversation, map the project's documentation:

1. **Scan for existing files** — look for:
   - `.claude/rules/*.md` files (path-scoped rules)
   - `CLAUDE.md` in project root and subdirectories
   - `.claude/CLAUDE.md`
   - `AGENTS.md` files (if present — some projects use these)
2. **Scan for auto memory** — check `~/.claude/projects/` for the current project's memory directory. Read `MEMORY.md` and note existing topic files.
3. **Check for hookify** — determine if the hookify plugin is available by looking for `.claude/hookify.*.md` files or the `hookify:hookify` skill. This determines whether hookify routing is available.
4. **Build a file map** — record discovered files, their domains (inferred from path and content headings), and approximate line counts.

If no documentation files exist at all, note this — Phase 3 will offer to create initial `.claude/rules/` files or a `CLAUDE.md`.

## Phase 1: Conversation Analysis

**If conversation is very short (<5 exchanges)**: Note that limited history may yield fewer or no friction signals. This is expected — the skill works best on substantial development sessions. Still run the scan, but don't force findings.

Scan the conversation for **friction signals** — moments where the user corrected, repeated, or overrode your behavior. For each signal, ask yourself:

1. **Already documented?** → Check the file map from Phase 0. If covered in any rules file or CLAUDE.md → Skip (you just missed it, no update needed)
2. **Already in auto memory?** → If the learning is already captured in the project's auto memory AND is personal/ephemeral → Skip
3. **Same mistake fixed in 2+ places AND regex-findable?** → Route through classification tree below
4. **Neither?** → Documentation update candidate

Categories of friction signals: corrections, repeated instructions, new patterns, outdated/incorrect info, missing coverage, repeated errors.

**Classification tree for every finding:**

```
Finding identified
  ├── Already in rules/CLAUDE.md/auto memory? → SKIP
  ├── Personal preference, not team-relevant? → SKIP (auto memory handles this)
  ├── Same error in 2+ places AND regex-findable? (hookify available?)
  │     ├── Wrong pattern expressible as regex?
  │     ├── File scope expressible as path regex?
  │     └── ALL YES + hookify available → Hookify rule candidate
  ├── Requires semantic/contextual understanding?
  │     └── YES → Rules file with explanatory prose
  └── Documentation gap → .claude/rules/ or CLAUDE.md update
```

**Regex-findability test** — ask yourself for each repeated error:
- Can I write a regex that catches the **wrong** pattern without false positives?
- Can I scope it to specific file paths?
- Is the correct alternative consistent and expressible in a message?

NEVER classify a semantic pattern as hookify-eligible just because you can write a regex that partially matches it. If the regex would produce false positives in legitimate code, it's NOT regex-findable.

For each finding, record: target file/system, exact change, and a direct conversation quote as evidence.

**Prioritize findings by impact**: corrections > repeated errors > missing coverage > outdated info.

### Team vs Personal Classification

For each finding, determine if it's team-relevant or personal:

| Team-relevant (this skill handles) | Personal (auto memory handles) |
|-------------------------------------|-------------------------------|
| Coding standards, naming conventions | Personal workflow preferences |
| Architectural decisions, patterns | IDE/tool configuration |
| Common pitfalls specific to this codebase | Debugging shortcuts |
| Framework usage rules | Build command variations |
| Security/quality constraints | Personal style preferences without quality impact |

If a finding is personal, note it in the summary but do NOT propose a documentation update.

**After Phase 1**: If findings > 0, **MANDATORY — load [ANALYSIS-GUIDE.md](ANALYSIS-GUIDE.md)** before proceeding. It contains extraction quality checks, writing style conventions, and anti-patterns you need for Phases 2-4. If zero findings, skip loading it — proceed directly to Phase 3 to report the result.

## Phase 2: Read and Verify Target Files

For each finding that passed Phase 1 classification:

1. **Read the target file** — fresh-read the specific rules file or CLAUDE.md section where the finding would go
2. **Verify genuinely missing** — drop anything already covered under a different heading or worded differently
3. **Check auto memory** — if the finding exists in auto memory AND is team-relevant, mark it as a "promotion candidate" (promote from personal memory to shared documentation)
4. **Check file size** — if the target file is approaching 200 lines, plan to propose a new `.claude/rules/<topic>.md` file instead of appending

Before proposing any finding, ask yourself: "If I read this documentation cold in a new session, would I do the right thing without this finding?" If yes — the finding is already covered implicitly. Skip it.

### Choosing the Right Target File

- **`.claude/rules/<topic>.md`** — for specific conventions scoped to file paths (use `paths` frontmatter). This is the preferred target for most findings.
- **`CLAUDE.md`** — for high-level project instructions, build commands, architecture overview. Keep under 200 lines.
- **Hookify rules** — for regex-findable repeated errors that should be blocked/warned at write time.
- **Existing rules files** — prefer appending to an existing relevant file over creating a new one.

When creating a new `.claude/rules/<topic>.md` file, use this structure:

```markdown
---
paths:
  - "src/api/**/*.ts"
  - "src/services/**/*.ts"
---

# [Topic Name]

[Rules here]
```

Omit the `paths` frontmatter if the rules apply project-wide.

## Phase 3: Interactive Review

**If zero findings**: Tell the user no actionable learnings were detected and briefly explain why (e.g., "conversation followed existing documentation closely" or "all corrections were already documented — I just missed them"). Do NOT load ANALYSIS-GUIDE.md — stop here.

**If >10 findings**: Group by target file and present the list of groups first, asking user if they want to review all or focus on specific files. This prevents review fatigue.

**If findings conflict with each other**: Present both, flag the conflict, and ask user to resolve before proceeding.

For EACH finding, present via `AskUserQuestion`:

```
**Finding [N/total]: [category]**
**Target:** `[.claude/rules/topic.md | CLAUDE.md | new file]`
**Section:** [section name]
**Type:** [Add | Modify | Remove]

**Context with proposed change:**

  [5-10 lines BEFORE from the file, or "new file" if creating]
+ [PROPOSED NEW/CHANGED LINES]
  [5-10 lines AFTER from the file]

**Evidence:** "[direct quote from conversation]"

Accept / Modify / Skip / Auto-memory?
```

The fourth option — **Auto-memory** — tells the user: "this learning is valid but personal; let auto memory handle it in future sessions rather than writing it to shared docs."

**For hookify rule candidates** (only when hookify is available), present differently:

```
**Finding [N/total]: Repeated error (hookify candidate)**
**Error pattern:** [what was wrong, seen in N places]
**File scope regex:** `[e.g., src/services/.*\.ts$]`
**Bad pattern regex:** `[e.g., import.*from 'legacy-lib']`
**Correct alternative:** [what should be used instead]

This can be caught at write-time with a hookify rule.
Accept (create hookify rule) / Skip?
```

**For promotion candidates** (found in auto memory, team-relevant):

```
**Finding [N/total]: Memory promotion**
**Currently in:** auto memory (`[memory topic file]`)
**Promote to:** `[.claude/rules/topic.md]`
**Content:** [the learning, rewritten in rules-file style]

**Why promote:** This learning benefits the whole team, not just this machine.

Accept / Skip?
```

Rules:
- Present ONE finding at a time, wait for response
- If user says "modify" — ask for their preferred wording
- Track all decisions for Phase 4
- For hookify candidates, check existing hookify rules to avoid duplicates
- **If user skips all findings**: Acknowledge gracefully — "No changes applied. If these patterns recur in future sessions, they'll surface again."

## Phase 4: Apply Changes

After ALL findings reviewed:

**For rules file / CLAUDE.md changes:**
1. Group accepted changes by file
2. Fresh-read each target file before editing (content may have changed since Phase 2)
3. Apply changes with the Edit tool
4. For new files, create with proper frontmatter (`paths` field if scoped)
5. After edits, verify no file exceeds 200 lines. If one does, suggest splitting in the summary.

**For hookify rule candidates (if hookify available):**
6. For each accepted hookify finding, use the `hookify:hookify` skill to create the rule

**For promotions from auto memory:**
7. Write the promoted content to the target rules file
8. Note in summary that the user may want to clean up the redundant auto memory entry

## Phase 5: Summary and Memory Coordination

Print a structured summary:

```
## Session Learning Summary

| Action | Count |
|--------|-------|
| Rules file updates | N |
| CLAUDE.md updates | N |
| Hookify rules created | N |
| Deferred to auto memory | N |
| Promotions from memory | N |
| Skipped | N |

### Files modified
- `.claude/rules/api-conventions.md` — added 2 rules
- `.claude/rules/testing.md` — created (new file, 3 rules)

### Deferred to auto memory
- [list of findings the user chose "Auto-memory" for — these are noted so the user knows they exist but are handled by the built-in memory system]
```

If any promotions were applied, remind the user: "You may want to review your auto memory (`/memory`) to remove entries that are now in shared rules files."

## Key Principles

1. **Evidence-based** — NEVER present a finding without a direct quote from the conversation. Paraphrased evidence lets confirmation bias slip through.
2. **One finding per review** — NEVER combine multiple findings into one. Bundling makes it hard for user to accept one and skip another.
3. **Team-shared over personal** — Focus on learnings that benefit the whole team. Let auto memory handle personal preferences.
4. **Native paths** — Write to `.claude/rules/` and `CLAUDE.md`, the files Claude Code actually loads. Not custom documentation formats.
5. **Non-destructive** — Never overwrite existing content. Append, modify with context, or create new files.
6. **Size-aware** — Respect the 200-line guideline for documentation files. Propose splits when approaching the limit.

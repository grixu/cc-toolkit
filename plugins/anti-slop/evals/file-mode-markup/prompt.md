---
description: A bilingual code-story chapter with SVG and a diff block; file mode may change prose only.
expected_outcome: The English and Polish prose is plain, the invented "hurried refactor" cause is gone, and every tag, attribute, SVG and diff line is unchanged.
tags: [file-mode, caller-contract]
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

chapter.html is one chapter of a code story, with English and Polish twins. Clean the AI slop out of its prose in place. The change it describes adds the `Dependencies:` label to the bold-label rule in plugins/dev-kit/skills/pr-open/SKILL.md; the commit gives no reason.

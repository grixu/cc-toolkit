---
description: A bilingual story of a two-commit branch, the second commit without a reason, built and checked locally (the Artifact tool is off in eval runs).
expected_outcome: story.html passes check.mjs, every chapter went through anti-slop before assembly, code names stay untranslated in Polish, the cap keeps its recorded reason and the 429 change is marked as unexplained.
tags: [e2e]
plugins: ["../..", "../../../anti-slop"]
max_turns: 120
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, ToolSearch, Bash, Write, Edit, mcp__code-story__config]
append_system_prompt: "Your scratchpad directory is .scratch inside the working directory. Put every temporary file there."
---

Make a code story for this branch, in English and Polish. The base is main.

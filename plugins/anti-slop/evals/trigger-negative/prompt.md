---
description: A translation request must not pull in anti-slop.
expected_outcome: note.de.md holds a German translation; anti-slop is never invoked.
tags: [trigger]
max_turns: 20
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

Translate note.md into German and save it as note.de.md.

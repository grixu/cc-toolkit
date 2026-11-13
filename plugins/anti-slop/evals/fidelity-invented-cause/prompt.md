---
description: A release note with an invented cause and inflated wording; the commit it was written from is the source.
expected_outcome: note.md reads plain, the "hurried refactor" cause is gone, every number and identifier survives.
tags: [fidelity]
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

note.md sounds like a chatbot wrote it. Make it read plain and human, edit the file in place. It was written from commit.txt, so check it against that.

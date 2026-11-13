---
description: A caller's flow with steps after the embedded cleanup (the pr-open shape); the cleanup must not end the turn.
expected_outcome: anti-slop runs in embedded mode, then the cleaned body is written and published by publish.sh, with the bold labels kept.
tags: [caller-contract]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

Run these steps in order without stopping to ask:

1. Read draft.md, a PR description draft for the branch's single commit, "fix(cart): keep the coupon when the quantity changes".
2. Clean its prose with anti-slop in embedded mode, with that commit as the source.
3. Write the cleaned description to body.md, keeping the headings and the bold labels.
4. Run `bash publish.sh body.md`.
5. Reply with the line `PUBLISHED` and the script's output.

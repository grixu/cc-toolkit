---
description: The embedded-mode contract pr-open relies on — only the cleaned text comes back.
expected_outcome: The reply is the cleaned body alone, with no "What changed" list or notes.
tags: [caller-contract]
max_turns: 20
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

I'm running dev-kit:pr-open and need the description's prose cleaned before the PR goes out. Use anti-slop in embedded mode and give me back only the cleaned body, nothing else. Source: the branch's single commit, "fix(cart): keep the coupon when the quantity changes".

Changing the quantity in the cart now keeps the applied coupon — a seamless experience that is not just a fix, but a crucial boost to customer trust. Previously `CartService.updateQuantity` recalculated the totals and silently dropped `couponCode`.

**Testing:** `pnpm test --filter cart` passed locally; not checked in a browser.

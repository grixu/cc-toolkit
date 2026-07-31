---
name: grill-topic
description: Grill the user relentlessly about a given topic, decision, plan or idea - round by round. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
argument-hint: "<topic, plan, decision or idea to grill — e.g. \"our retry strategy\" or path/to/PLAN.md>"
---

The topic to grill: **$ARGUMENTS**

If no topic was given, ask the user what to grill before starting the first round.

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask *now* without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a *later* round, not this one.

Finding *facts* is your job, never the user's. When a frontier question needs a fact from the codebase, dispatch the `Explore` subagent. If you need to find facts, details, opinions or alternative solutions by digging into documentation, dispatch the `fd3:researcher` subagent. Don't ask the user for anything you could look up yourself. The *decisions* are the user's — put each to them and wait.

Never pass `name:` when dispatching a sub-agent. An unnamed one delivers its whole report in the task notification; a named one only answers a later pull, and may deliver nothing at all.

A question you dispatched a lookup for is **blocked by that lookup** — no exceptions. Do not predict what the lookup will return, or which questions it will turn out to touch: whether a fact changes a question is knowable only once you hold the fact. Never write that a pending lookup "only affects the next round". Questions you sent nobody to answer are not blocked — ask those now; a running lookup is an unsettled prerequisite for its own question only.

A fact you cannot reach because *you* lack access — an expired token, a console-only setting — is still not a decision. Ask the user for that one command outside the numbered questions, and keep the question it feeds blocked meanwhile.

If a late fact contradicts a question you already asked, re-ask that numbered question with the fact, and say plainly that its earlier version and any answer to it are void. Never fold the correction into the next round and leave the user guessing which of their answers still stands.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

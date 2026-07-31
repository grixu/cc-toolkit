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

Finding *facts* is your job, never the user's. When a frontier question needs a fact from the codebase, dispatch the `Explore` subagent. If you need to find facts, details, opinions or alternative solutions by digging into documentation, dispatch the `fd3:researcher` subagent. Don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report — ask the rest of the frontier now. The *decisions* are the user's — put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

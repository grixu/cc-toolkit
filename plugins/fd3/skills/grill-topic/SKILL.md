---
name: grill-topic
description: Grill the user relentlessly about a given topic, decision, plan or idea - round by round. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
argument-hint: "<topic, plan, decision or idea to grill>"
---

The topic to grill: **$ARGUMENTS**

If no topic was given, ask the user what to grill before starting the first round.

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

## Before the first round

Establish the facts the topic asserts, before asking anything. A topic document is a hypothesis: it was written from memory, from an earlier state of the system, or from a plan that has since drifted. Dispatch the lookups that settle its load-bearing claims, and then open round 1 with **every place the topic document turns out to be wrong** — one line per finding, each with the consequence for the decision it touches.

This is the highest-value work in the whole session. A round asked against the document gets answers about the document; a round asked against reality gets answers you can build on.

## Rounds

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask *now* without guessing at answers you haven't heard yet. Ask the whole frontier in one round. Then wait for the user's answers before the next round.

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a *later* round, not this one.

Number every question, and give each one **named options with a marked recommendation**: two or three alternatives that are actually live, each with the cost of choosing it, and one marked as your recommendation. The recommendation is the point — an even-handed menu makes the user do the comparison you were meant to do. Where one decision has parts that cannot be settled separately, sub-letter them (`4a`, `4b`, `4c`) rather than splitting them across rounds or collapsing them into one question.

Every question a user is meant to answer carries its own number — none arrives buried in the tail of another.

Track which numbered questions came back answered. A question the user skipped is still open: re-put it in the next round, labelled as carried over. Silence is not assent.

## Facts

Finding *facts* is your job, never the user's. The *decisions* are the user's — put each to them and wait.

Route every lookup by where the fact lives — the routes and dispatch rules are in `${CLAUDE_SKILL_DIR}/../../references/fact-routes.md`; read that file before dispatching anything.

A question you dispatched a lookup for is **blocked by that lookup** — no exceptions. Do not predict what the lookup will return, or which questions it will turn out to touch: whether a fact changes a question is knowable only once you hold the fact. Never write that a pending lookup "only affects the next round". Questions you sent nobody to answer are not blocked — ask those now; a running lookup is an unsettled prerequisite for its own question only.

A fact you cannot reach because *you* lack access — an expired token, a console-only setting — is still not a decision. Ask the user for that one command outside the numbered questions, and keep the question it feeds blocked meanwhile.

## Corrections

If a late fact contradicts a question you already asked, re-ask that numbered question with the fact, and say plainly that its earlier version and any answer to it are void. The same applies when the faulty premise was *yours* — a recommendation you argued from a wrong fact voids the answer it produced just as hard. Never fold the correction into the next round and leave the user guessing which of their answers still stands.

## Closing

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.

Close with a summary of every settled decision, and end it with a section listing **the decisions you took that the user never answered** — the places where their answer to one question implied an answer to another, and you resolved it yourself. That section is what makes "nothing left silently assumed" true rather than aspirational; a decision the user ratifies is theirs, one they never saw is yours.

Do not act on any of it until the user confirms you have reached a shared understanding.

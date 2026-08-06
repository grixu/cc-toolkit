---
name: grill-topic
description: Grill the user relentlessly about a topic until its design tree is settled. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
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

A round stays open until the user answers it. A lookup that returns while a round is open is not an answer and never opens a new round — post what it changed and stop; the only thing it may add is a correction, on the terms the Corrections section sets. Two unanswered rounds are never in flight at once.

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a *later* round, not this one.

Number every question, and give each one **named options with a marked recommendation**: two or three alternatives that are actually live, each with the cost of choosing it, and one marked as your recommendation. The recommendation is the point — an even-handed menu makes the user do the comparison you were meant to do. Where one decision has parts that cannot be settled separately, sub-letter them (`4a`, `4b`, `4c`) rather than splitting them across rounds or collapsing them into one question.

Before a question goes out, check the facts you already hold for anything that eliminates one of its options. An option the question itself dismisses, that a later round has to recommend, means the question shipped missing a fact you had — and the user's answer to it was never a real choice.

Every question a user is meant to answer carries its own number — none arrives buried in the tail of another.

Track which numbered questions came back answered. A question the user skipped is still open: re-put it in the next round, labelled as carried over. Silence is not assent.

## Question style

Brevity comes from leaving things out, not from compressing the wording: drop whatever does not change the user's choice, and write what remains in plain, complete sentences. A question is one or two sentences; an option is its name, what choosing it means, and its cost — a sentence or two each; the recommendation says *why* in one sentence, because a bare "recommended" pushes the comparison back onto the user.

Two rules guard against false brevity:

- **Every question is self-contained.** Restate the one fact it turns on, even when a lookup or an earlier answer already established it — "as established in Q3" or "per the ADR" sends the user digging through history, and a restated half-sentence is cheaper than that trip.
- **Use only names and terms the user has already met.** Spell abbreviations out, and gloss any term of art the first time a round uses it. A user who cannot parse the question will guess, or follow the recommendation blind — both defeat the grilling.

One question from a round, formatted as every question should be:

```
3. Where should retry state live? Today the worker keeps it in memory, so a pod restart
   loses the count and the job starts its retries from zero.
   - **a) Redis, alongside the job queue** — state survives restarts and is visible across
     workers; the cost is one more thing Redis has to stay up for. **Recommended**: the
     queue already runs on Redis, so this adds no new dependency to operate.
   - **b) A column on the jobs table** — no new infrastructure, but every retry becomes a
     write to what is already the busiest table in the system.
```

## Facts

Finding *facts* is your job, never the user's. The *decisions* are the user's — put each to them and wait.

Route every lookup by where the fact lives — the routes and dispatch rules are in `${CLAUDE_SKILL_DIR}/../../references/fact-routes.md`; read that file before dispatching anything.

A question you dispatched a lookup for is **blocked by that lookup** — no exceptions. Do not predict what the lookup will return, or which questions it will turn out to touch: whether a fact changes a question is knowable only once you hold the fact. Questions you sent nobody to answer are not blocked — ask those now; a running lookup is an unsettled prerequisite for its own question only.

## Corrections

If a late fact contradicts a question you already asked, re-ask that numbered question with the fact, and say plainly that its earlier version and any answer to it are void. The same applies when the faulty premise was *yours* — a recommendation you argued from a wrong fact voids the answer it produced just as hard. Never fold the correction into the next round and leave the user guessing which of their answers still stands.

When an answer collides with a cost you yourself wrote, say so in the acknowledgement before recording it, and name the fact that would settle the collision. Writing the answer down and carrying the contradiction into the summary makes you the author of a conflict the user never saw.

## Closing

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.

Close with a summary of every settled decision, and end it with a section listing **the decisions you took that the user never answered** — the places where their answer to one question implied an answer to another, and you resolved it yourself. That section is what makes "nothing left silently assumed" true rather than aspirational; a decision the user ratifies is theirs, one they never saw is yours.

Do not act on any of it until the user confirms you have reached a shared understanding.

Once the user confirms, write the summary to a file in the session scratchpad as three numbered lists with stable IDs: **ratified decisions** — one line each, carrying the question number and the option chosen — **decisions you took yourself**, and **risks the user accepted**. The chat summary stays; the file is what downstream skills consume. When a downstream skill is invoked, its argument is that file's path, never a description of where the notes are.

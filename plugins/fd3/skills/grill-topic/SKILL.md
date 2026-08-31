---
name: grill-topic
description: Grill the user relentlessly about a topic until its design tree is settled. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
argument-hint: "<topic, plan, decision or idea to grill>"
---

The topic to grill: **$ARGUMENTS**

If no topic was given, ask the user what to grill and stop until they answer. A topic found in the repository is not the topic you were given.

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

## Before the first round

Establish the facts the topic asserts, before asking anything. A topic document is a hypothesis: it was written from memory, from an earlier state of the system, or from a plan that has since drifted. Dispatch the lookups that settle its load-bearing claims, and then open round 1 with **every place the topic document turns out to be wrong** — one line per finding, each with the consequence for the decision it touches.

This is the highest-value work in the whole session. A round asked against the document gets answers about the document; a round asked against reality gets answers you can build on.

Two things come before the first dispatch. `git fetch` the repository and say if the tree is behind the branch the topic describes — facts cited from a stale clone drift on exactly the files the session will argue from. And read the repository's own prior specs, ADRs and decision records (`docs/specs/`, `requirements/`, wherever they live): a question one of them already settles is not a question, and a lookup dispatched without them re-researches a decision the repository has already made.

For every library, service or tool the topic names, establish three versions: the one the lockfile resolves — never the manifest range — the current release, and the one whose API the discussion will quote. Any difference between them is a round-1 finding: an API argued from the wrong version becomes pseudocode nobody can run. A table when there are more than two, a line each otherwise.

Read each lookup's report against its own data before using it: where the prose contradicts its own table, the table wins and the contradiction is a finding. Two lookups that return different numbers for the same thing are a finding too, never a silent pick.

## Rounds

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask *now* without guessing at answers you haven't heard yet. Ask the whole frontier in one round. Then wait for the user's answers before the next round.

A round stays open until the user answers it. A lookup that returns while a round is open is not an answer and never opens a new round — post what it changed and stop; the only thing it may add is a correction, on the terms the Corrections section sets. Two unanswered rounds are never in flight at once.

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a *later* round, not this one.

Number every question, and give each one **named options with a marked recommendation**: two or three alternatives that are actually live, each with the cost of choosing it, and one marked as your recommendation. The recommendation is the point — an even-handed menu makes the user do the comparison you were meant to do. Where one decision has parts that cannot be settled separately, sub-letter them (`4a`, `4b`, `4c`) rather than splitting them across rounds or collapsing them into one question.

Before a question goes out, check the facts you already hold against **every** option — for one they eliminate, and for an option they should have added. An option the question itself dismisses, or a fact you hold that makes a fourth option obviously better than the three you listed, means the question shipped missing a fact you had — and the user's answer to it was never a real choice.

Every question a user is meant to answer carries its own number — none arrives buried in the tail of another.

Open every round after the first with one line naming the numbers still unanswered from earlier rounds — `Open from earlier rounds: 18–25` — before any new question. When a round contains sub-lettered questions, close it with the list of labels you expect back (`1, 2, 3a, 3b, 4`): a bare number against a sub-lettered question is one answer short, and you will not know which half it was.

A blocked question keeps its number and stays out of the round's numbered items; name it on the line that opens the round. A number printed inside the round is a number the user will answer.

Track which numbered questions came back answered. A question the user skipped is still open: re-put it in the next round under its original number, labelled as carried over, with its options and costs written out in full — a carried-over question compressed to a list of recommendations is not a question, and a user who answers one is ratifying a menu they cannot see. Numbers are never reassigned, so the summary can cite one decision by one name. Silence is not assent, and there is no round count after which it becomes assent.

A defect the user admits to scope is work admitted, not work decided: each admitted defect gets its own numbered question with fix options, or an explicit deferral with an owner. A batch yes/no that sweeps a dozen defects into scope leaves every one of them undesigned.

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

The session's research directory is `research/` in the session scratchpad. Dispatch prompts name it, agents write their full reports there, and what enters this conversation is each report's condensed answers and its file path. When a round argues from a report's findings, cite the file — the user can open the evidence.

A question you dispatched a lookup for is **blocked by that lookup** — no exceptions. Do not predict what the lookup will return, or which questions it will turn out to touch: whether a fact changes a question is knowable only once you hold the fact. Questions you sent nobody to answer are not blocked — ask those now; a running lookup is an unsettled prerequisite for its own question only.

A recommendation is never conditional. If you would write "recommended, provided the check confirms it", the question is blocked by that check and stays out of the round — a conditional recommendation gets answered as an unconditional one. The same bar holds inside an option's cost, its preamble and the recommendation itself: any admission that something outside this conversation is unchecked — a source unread, a contradiction unresolved, a behaviour unobserved — is a conditional recommendation wearing a cost's clothes, and the question is blocked by that lookup. If you find yourself writing the hedge, you have found the dispatch.

A `path:line` that arrived inside a lookup report is that report's claim, not yours. Open it before you put it in front of the user as the reason a decision changes — a citation off by ten lines reads as a citation nobody checked, and it is the finding you most need believed.

## Corrections

If a late fact contradicts a question you already asked, re-ask that numbered question with the fact, and say plainly that its earlier version and any answer to it are void. The same applies when the faulty premise was *yours* — a recommendation you argued from a wrong fact voids the answer it produced just as hard. Never fold the correction into the next round and leave the user guessing which of their answers still stands.

When an answer collides with a cost you yourself wrote, say so in the acknowledgement before recording it, and name the fact that would settle the collision. Writing the answer down and carrying the contradiction into the summary makes you the author of a conflict the user never saw.

## Closing

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.

Before declaring the frontier empty, list the gaps you invoked as reasons inside your own recommendations. A gap you argued from more than once is a decision the user never got to make — it belongs in a round, not in the risk list. Closing a session by accepting a risk you spent it citing means you recommended around the question instead of asking it.

Close with a summary of every settled decision, and end it with a section listing **the decisions you took that the user never answered** — the places where their answer to one question implied an answer to another, and you resolved it yourself. That section is what makes "nothing left silently assumed" true rather than aspirational; a decision the user ratifies is theirs, one they never saw is yours. A headline figure you computed rather than measured carries the arithmetic that produces it and names the assumption it rests on, in the summary itself.

Do not act on any of it until the user confirms you have reached a shared understanding.

Once the user confirms, write the summary to a file in the session scratchpad as four numbered lists with stable IDs: **ratified decisions** — one line each, carrying the question number and the option chosen — **decisions you took yourself**, **risks the user accepted**, and **research files** — the path of each report in the session's research directory with one line naming what it establishes. The chat summary stays; the file is what downstream skills consume. When a downstream skill is invoked, its argument is that file's path, never a description of where the notes are.

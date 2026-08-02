# Spec template

The shape a spec needs to be implementable, or splittable into tasks, without a second conversation.
`validate-spec` reads this file to decide what a section is missing; `build-spec` writes against it.

Sections are ordered as a reader needs them, not as they are written. Drop a section the subject
genuinely has no instance of, and say in one line that it has none — a silently absent section reads
the same as a forgotten one. Everything below is prose and tables; there is no schema to satisfy.

## Contents

- [1. Header and precedence](#1-header-and-precedence)
- [2. Problem and goal](#2-problem-and-goal)
- [3. Design decisions](#3-design-decisions)
- [4. Target architecture](#4-target-architecture)
- [5. Ownership](#5-ownership)
- [6. The change, per repository](#6-the-change-per-repository)
- [7. Rollout](#7-rollout)
- [8. Verification](#8-verification)
- [9. Cleanup](#9-cleanup)
- [10. Out of scope](#10-out-of-scope)
- [11. Tickets](#11-tickets)
- [12. Appendix — the evidence record](#12-appendix--the-evidence-record)
- [Rules that hold everywhere](#rules-that-hold-everywhere)

## 1. Header and precedence

Title, one sentence on what changes, the epic or ticket, a status, a date. Then the companion
documents, each as a link.

Then, if the spec disagrees with anything already written down — an earlier design note, a set of
ADRs, a previous iteration — a **precedence declaration**: what it supersedes, on what, and who wins
where they disagree. Follow it with the list of what is actually reversed, one entry per reversal,
each naming the document, the decision, and where this spec decides otherwise.

Three failure modes to write around. A declaration with no list ("the reversals are listed below") is
an empty promise. A categorical closing claim ("everything else is carried forward unchanged") is
unauditable unless it enumerates — so enumerate, and name any decision that was already superseded
inside the source set, so a reader who finds the disagreement does not read it as a silent reversal.
And a count in the prose has to match the list it introduces — "three design choices" followed by two
entries is a defect a reader finds in ten seconds.

## 2. Problem and goal

What is wrong today, in facts with citations rather than adjectives. Then the goal, in one sentence
a reader could disagree with. If a secondary goal shapes the solution's structure, say so here —
otherwise every later structural choice looks arbitrary.

## 3. Design decisions

A table, one row per decision, numbered `D1`…`Dn` so the rest of the document can cite them.

| # | Decision | Rationale |
|---|---|---|
| D1 | **The decision, stated as a choice already made** | Why, with the evidence that settles it (`path:line`, a doc quote, a probe). Name the ADR or document it reverses. |

A rationale is load-bearing: it says what would have to change for the decision to flip. A decision
whose rationale is "cleaner" or "best practice" is not yet a decision. Where the choice cost
something, say what was accepted — "cost accepted: a second permission matrix" is a complete
rationale; "no downsides" is a warning sign.

## 4. Target architecture

What the system looks like when this is done. Every element the spec will build gets a description,
a schema, or pseudocode — code-shaped elements get the real thing, at the level a reviewer can check:

```hcl
resource "example" "thing" {
  field = var.value
}
```

An element's contract is complete when its fields, types, errors, auth and limits are all decided.
An inline comment on a gotcha earns its place here ("field order is namespace, then KSA — reversing
it yields a string the API accepts and the caller cannot use").

Every element carries an **element code**: a category prefix and an ordinal — `DB-1`, `API-2`,
`INFRA-3`. The categories are `DB`, `API`, `CONFIG`, `OBSERVABILITY`, `UI`, `INTEGRATION`, `TEST`,
`INFRA`, `DOCS`, `CICD`. The code is assigned here, where the element is defined, and is write-once:
adding or dropping elements never renumbers the others, and a dropped element's code is never
reused. Everywhere else in the document — a work item, a verification row, an evidence claim — the
element is cited by its code, so the reference survives any reshuffling of the prose.

Then a **prerequisites table**, one row per thing that must already be true, each with its status and
the evidence for that status. "Enabled" is not a status; "enabled — `cluster-a` and `cluster-b`, both
`region-x`" is.

| Prerequisite | Status |
|---|---|

## 5. Ownership

Who owns what, and how each piece reaches production.

| Repository / component | Owns | Apply mechanism |
|---|---|---|

Then the approval reality: which paths need whose review, which have no pipeline at all, which need a
human to run the apply. A spec that plans work in somebody else's repository and does not say how it
lands there has a gap where its critical path should be.

## 6. The change, per repository

One subsection per repository or module, listing the concrete work items. Every item names the
element codes it builds or changes, cites the file and line range it touches, and says whether it
is new, changed, or removed. This is the section that
gets split into tasks, so an item a reader cannot start from is an item that is not finished being
written.

Where a domain model is involved — permissions, schema changes, API surface — give it its own
section before this one, split into what is kept, what is narrowed, and what is dropped, with the
evidence for each drop. A drop justified only by "unused" needs the search that establishes it.

## 7. Rollout

A phase table. The last column is the one that matters: whether the phase changes behaviour or only
prepares.

| # | Phase | Where | Switches anything? |
|---|---|---|---|

Then the order across environments, with the waiting period and the reason for its length. Then
every **hard dependency** — anything outside this spec that must land first — each identified
precisely enough to check: a pull-request number, a release, a gate. "The pending pull request" names
nothing. Say whether the gate is a merge or a deploy, because they are different gates.

Then rollback: for each phase that switches something, what reverses it and what makes the reversal
complete.

## 8. Verification

How the delivered result is checked, per element, each cited by its code. Split by what is
actually possible:

- **Probes** — cheap, unambiguous, runnable on demand. Give the command and the expected output,
  including what the output looks like *before* the change, so a false pass is recognisable.
- **Triggered** — exercisable by using the feature.
- **Observed only** — things that need a state you cannot create. Name the substitute that stands in
  for a test, its duration, its signal, and say plainly that it is observation rather than a test.

Every phase needs a row here. A phase with no verification is a phase whose completion is a matter of
opinion.

## 9. Cleanup

What gets deleted, in what order, and the gate before each irreversible step. An irreversible step
needs its mechanics stated correctly — what the window actually is, what it applies to, what happens
if you re-create the thing you deleted — because this is where a wrong fact costs the most and gets
checked the least.

## 10. Out of scope

Every item, with an **owner** and a **placement**: a ticket number, a gate, or a named person or
team. "Each gets its own ticket" with no numbers is not a placement — it is a list of work nobody is
holding. Where the boundary cuts through the middle of an item, say which half is in scope and where
it lives, so the exclusion cannot be read as excluding both halves.

## 11. Tickets

What exists already, by identifier, and what is genuinely new. Check the tracker before claiming
either — a spec that says "two tickets are added" when eleven already exist produces duplicates.

## 12. Appendix — the evidence record

A table. This is the spec's proof of work, and it is what a validation pass spot-checks and extends.

| Claim | How it was verified |
|---|---|
| The claim, as the spec asserts it | The command, the `path:line`, the doc quote, or the probe transcript. Not "checked the code". |

A claim that rests on inference says so — "no documentation states the negative explicitly; treat as
strong inference, confirmed empirically at stage before prod" is honest and actionable. Softening it
into a confirmation is the one thing this table exists to prevent.

## Rules that hold everywhere

- **A declared gap passes; an undeclared one does not.** Anything the spec cannot settle is fine if
  the spec says so and names an owner and a placement. The spec's own team is the default owner, so
  an owner needs naming only when it is somebody else. A placement has to be specific enough to act
  on.
- **No vague verb carries a claim.** "Handles", "supports", "properly", "as needed", "where
  appropriate" — each hides the decision a reader needs.
- **No undecided either/or.** "Redis or Postgres", "sync or async" with no decision recorded is a
  question wearing a statement's clothes. A choice consciously handed to a named owner is deferred,
  which is different.
- **Every citation resolves.** A `path:line` that no longer points at what the spec says it does is
  worse than no citation, because it reads as verified.
- **Elements are cited by code.** `API-2` names the same element for as long as the spec lives;
  "the second endpoint" and "section 4.2" both break the first time the document is reorganised.
- **Every referenced document is named precisely enough to open.** "The ADRs from last month" is not
  a reference.

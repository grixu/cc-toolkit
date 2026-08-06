---
name: write-spec
description: Write a specification from a design understanding that is already settled. Use after a grilling session reaches confirmed shared understanding, or when the user wants a settled design written up as a SPEC.
argument-hint: "[<path to write the spec to>]"
---

Where to write the spec: **$ARGUMENTS**

The shape to write against is `${CLAUDE_SKILL_DIR}/../../references/spec-template.md`, and the
invariants that hold in every section are in `${CLAUDE_SKILL_DIR}/../../references/spec-rules.md`.
Read both before writing anything. They are the same two files `fd3:validate-spec` measures a spec
against — a section they name and you omit is a finding waiting to happen.

## Precondition

This writes up an understanding that is **already settled**. Normally that is a `fd3:grill-topic`
session whose closing summary the user has confirmed, in this same conversation.

The invocation normally carries the path to that session's closing-notes file — three numbered
lists: ratified decisions with their question numbers and chosen options, decisions the assistant
took, and risks the user accepted. Read it before writing and hold it as the checklist section 6
walks. Without the file, build the same checklist from the confirmed closing summary in the
conversation before writing anything.

If you were invoked without that — no grilling in context, or a grilling the user never confirmed —
say so and stop. Ask whether to grill the topic first, or which document holds the settled design. Do
not reconstruct the decisions yourself: a spec whose decisions nobody ratified is a proposal wearing a
specification's clothes.

## 1. Where it goes

Ask once, before writing: the path. Give your recommended answer first. Where `$ARGUMENTS` already
names the path, skip the question and confirm the directory exists. Once the path is known, move the
closing-notes file beside the spec as `<spec-basename>.notes.md` — it outlives the session, and a
validation pass can read the decisions' provenance from it.

Ask this once and never again. A spec is written in one pass; do not stop mid-document to ask where
the next section goes.

## 2. What goes in

Only what the session settled or established. The template defines every section's shape —
write against the file, not from memory of it. What the template cannot know is how a grilling
session maps into it:

- **Decisions.** One row per decision the user actually ratified, `D1`…`Dn`. A decision you
  took yourself, that the user's closing confirmation covered without answering directly,
  still goes in — and its rationale says that it followed from another answer.
- **Precedence.** Before writing "everything else is carried forward unchanged", check the
  status field of every document in the superseded set, and enumerate what "everything
  else" is.
- **Out of scope.** Check the tracker for the actual ticket numbers before writing
  placements — "each gets its own ticket" places nothing.
- **The concrete work, per repository** is what gets split into tasks, so an item nobody
  could start from is not finished being written.
- **Rollout.** The phase table opens at phase 1 and places every work item from the
  per-repository section. Independent groundwork is not a note beside the table — it is
  phase 1. Mark the gates: a phase followed by a deployment boundary — a bake, an
  environment promotion, an approval between changes — closes a landing unit, and the
  evidence for each gate is technical, gathered like any other fact. Then estimate each
  landing unit's aggregate diff from the work items it places; where one plausibly exceeds
  **80 changed files or 2000 changed lines**, generated files excluded, put the subdivision
  to the user — with proposed seams, such as phase boundaries or dependency clusters — in
  the same single batch as the step-1 question. A user-requested split becomes a gate in
  the table like any other; the threshold itself never appears in the spec.

## 3. The evidence appendix

Every load-bearing claim gets a row: the claim as the spec asserts it, and how it was established —
the command, the `path:line`, the doc quote, the probe output. Not "checked the code".

This table is the spec's proof of work and the thing a validation pass spot-checks first, so it is
worth more than any prose you could write instead. Two rules:

- **A claim that rests on inference says so.** "No documentation states the negative explicitly; treat
  as strong inference, confirmed empirically at stage before prod" is honest and actionable. Turning
  it into a confirmation is the single most damaging thing you can do to this table.
- **A claim with no evidence does not become an assertion.** Look it up, routed by where the
  fact lives — the routes and dispatch rules are in
  `${CLAUDE_SKILL_DIR}/../../references/fact-routes.md`. If it stays unsettled, it goes into
  the document as a declared gap with an owner and a placement, never as a bare statement.

## 4. Declared gaps

Anything the session could not settle goes into the document as a **declared gap**, on the terms
`spec-rules.md` sets. A gap left as confident prose is the failure this whole section exists to
prevent.

## 5. Length and tone

Every sentence either records a decision, an element, a fact with its source, or a gap with its
owner. Nothing restates what a table already says, and nothing narrates the process that produced the
document — a reader implementing this needs the conclusion, not the reasoning that reached it, except
where the reasoning is the rationale of a decision.

Write in English regardless of the language of the grilling.

## 6. The spec is written when

Every section the template names is present, or absent with the one line that says the subject has no
instance of it; every decision the session settled has a row in the decision table; every element
carries its element code; and every load-bearing claim has either an evidence row or a declared gap
with an owner and a placement. Check this against the document you wrote, not against your memory of
writing it.

## 7. After writing

Report where it went and how long it is. Then say plainly what is not yet settled in it: the declared
gaps, and anything you were unable to verify. Offer `fd3:validate-spec` on the file as the next step —
it will spot-check the appendix, resolve every citation and run the section checks — and let the user
decide whether to run it.

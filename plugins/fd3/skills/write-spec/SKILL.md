---
name: write-spec
description: Write a specification from a design understanding that is already settled — decisions, elements, rollout, verification and an evidence appendix, against the fd3 spec template. Use after a grilling session reaches confirmed shared understanding, or when the user wants a settled design written up as a SPEC.
argument-hint: "[<path to write the spec to>]"
---

The shape to write against is `${CLAUDE_SKILL_DIR}/../../references/spec-template.md`. Read it before
writing anything. It defines the sections, and it is the same file `fd3:validate-spec` measures a spec
against — a section it names and you omit is a finding waiting to happen.

## Precondition

This writes up an understanding that is **already settled**. Normally that is a `fd3:grill-topic`
session whose closing summary the user has confirmed, in this same conversation.

If you were invoked without that — no grilling in context, or a grilling the user never confirmed —
say so and stop. Ask whether to grill the topic first, or which document holds the settled design. Do
not reconstruct the decisions yourself: a spec whose decisions nobody ratified is a proposal wearing a
specification's clothes.

## 1. Where it goes

Ask once, before writing: the path, and whether anything besides Markdown is wanted. Give your
recommended answer first. `$ARGUMENTS` already names the path when the user supplied one — then do not
ask, just confirm the directory exists.

Ask this once and never again. A spec is written in one pass; do not stop mid-document to ask where
the next section goes.

## 2. What goes in

Only what the session settled or established. Concretely, in the template's order:

- **The precedence declaration.** If this spec disagrees with anything already written — an earlier
  design note, a set of ADRs, a previous iteration, a document the user pointed you at — declare what
  it supersedes, and then **enumerate every reversal**: the document, the decision, and where this
  spec decides otherwise. Two things this list must get right, because both were got wrong before:
  - A count in the prose has to match the list. "Three design choices" with two entries is a defect a
    reader finds in ten seconds.
  - A decision that was **already superseded inside its own source set** is not reversed by you. Name
    it as such, with its successor, so a reader who finds the disagreement does not read it as a
    silent reversal. Check the status field of every document in the set before writing the sentence
    "everything else is carried forward" — and if you write it, enumerate what "everything else" is.
- **The decision table.** One row per decision the user actually ratified, `D1`…`Dn`, each with the
  rationale that settles it and the cost that was accepted. A decision you took yourself, that the
  user's closing confirmation covered without answering directly, still goes in — and its rationale
  says that it followed from another answer.
- **Elements, with a contract each.** Description, schema or pseudocode; fields, types, errors, auth,
  limits. Real code for code-shaped elements. A gotcha that would cost someone an afternoon earns an
  inline comment. Assign each element its **element code** — a category prefix and an ordinal,
  `DB-1`, `API-2`; the template lists the categories — where the element first appears, and cite it
  by code everywhere afterwards. Codes are write-once: never renumbered, never reused.
- **The concrete work, per repository**, every item naming the element codes it builds and citing
  the `path:line` it touches. This is what gets split into tasks, so an item nobody could start from
  is not finished.
- **Rollout, verification, cleanup** — phases with whether each one switches behaviour, environment
  order with the reason for its length, hard dependencies identified precisely enough to check, and a
  verification row for every phase.
- **Out of scope**, each item with an owner and a placement. Check the tracker for the ticket number
  rather than writing "each gets its own ticket" — that sentence places nothing. Where the boundary
  cuts through the middle of an item, say which half is in scope and where that half lives.

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

Anything the session could not settle is fine in the document, on one condition: the spec says so and
names both an **owner** and a **placement** — a gate, a ticket number, or the verification substitute
that stands in for a test. The team writing the spec is the default owner, so an owner needs naming
only when it is somebody else. A placement has to be specific enough to act on.

A spec that documents its own gaps is the well-written one. A gap left as confident prose is the
failure this whole section exists to prevent.

## 5. Length and tone

As long as its content needs and no longer. Every sentence either records a decision, an element, a
fact with its source, or a gap with its owner. Nothing restates what a table already says, and nothing
narrates the process that produced the document — a reader implementing this needs the conclusion, not
the reasoning that reached it, except where the reasoning is the rationale of a decision.

Write in English regardless of the language of the grilling.

## 6. After writing

Report where it went and how long it is. Then say plainly what is not yet settled in it: the declared
gaps, and anything you were unable to verify. Offer `fd3:validate-spec` on the file as the next step —
it will spot-check the appendix, resolve every citation and run the section checks — and let the user
decide whether to run it.

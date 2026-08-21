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
took, risks the user accepted, and the research files the session produced. Read it before writing
and hold it as the checklist section 6 walks. Without the file, build the same checklist from the
confirmed closing summary in the conversation before writing anything.

When this skill runs in a sub-agent, the closing-notes file and the research directory it lists
are the whole input — there is no conversation to consult. A fact in neither file is a gap to
declare or a lookup to dispatch, never a recollection.

If you were invoked without that — no grilling in context, or a grilling the user never confirmed —
say so and stop. Ask whether to grill the topic first, or which document holds the settled design. Do
not reconstruct the decisions yourself: a spec whose decisions nobody ratified is a proposal wearing a
specification's clothes.

## 1. Where it goes

Ask once, before writing: the path. Give your recommended answer first. Where `$ARGUMENTS` already
names the path, skip the question and confirm the directory exists. Once the path is known, move the
closing-notes file beside the spec as `<spec-basename>.notes.md` — it outlives the session, and a
validation pass can read the decisions' provenance from it. Move the session's research directory
the same way, as `<spec-basename>.research/`, and rewrite every scratchpad path the notes or the
spec cite to the new location — evidence a later pass cannot open is evidence lost.

Ask this once and never again. A spec is written in one pass; do not stop mid-document to ask where
the next section goes.

## 2. What goes in

Only what the session settled or established. The template defines every section's shape —
write against the file, not from memory of it. What the template cannot know is how a grilling
session maps into it:

- **Decisions.** One row per decision the user actually ratified, `D1`…`Dn`. Each rationale
  opens with its provenance: the question number and option the user chose, or
  `assistant-taken` and the answer it followed from. A decision you took yourself, that the
  user's closing confirmation covered without answering directly, still goes in on those
  terms — and where a decision supersedes one of the user's own answers, the rationale names
  that answer and why it fell. An end state whose provenance is missing reads as the user's
  choice when it was yours.
- **Facts are not work.** A fact a lookup established belongs in the problem statement and
  the evidence appendix; it does not by itself put a work item in the per-repository
  section. Work nobody ratified goes to out-of-scope with an owner and a placement, marked
  as surfaced during analysis — never into a phase. An option the session explicitly
  declined does not reappear anywhere.
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
the command, the `path:line`, the doc quote, the probe output. Not "checked the code". A claim a
research file establishes cites that file's path beside the source it quotes.

This table is the spec's proof of work and the thing a validation pass spot-checks first, so it is
worth more than any prose you could write instead. Two rules:

- **A claim that rests on inference says so.** "No documentation states the negative explicitly; treat
  as strong inference, confirmed empirically at stage before prod" is honest and actionable. Turning
  it into a confirmation is the single most damaging thing you can do to this table.
- **A claim with no evidence does not become an assertion.** Look it up, routed by where the
  fact lives — the routes and dispatch rules are in
  `${CLAUDE_SKILL_DIR}/../../references/fact-routes.md`. If it stays unsettled, it goes into
  the document as a declared gap with an owner and a placement, never as a bare statement.

A number you chose while writing — a bake period, a waiting window, a threshold, a version — is a
claim like any other: it gets an evidence row stating its basis, or it becomes a declared gap. A
plausible reason attached to a number nobody agreed is still a number nobody agreed.

Before the document is reported done, resolve every `path:line` you did not read yourself — the
citations inherited from lookup reports are the ones that drift. Batch the checks per file. A
citation that will not resolve is deleted or downgraded to a filename, never left for a validation
pass to find.

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

Then two counted passes, both against the file. Walk the closing-notes checklist entry by entry:
each ratified decision, assistant-taken decision and accepted risk names the `Dn` row, element code,
gap or rollout step that carries it — an entry with no landing place is a decision you dropped or a
gap you owe the reader. And count: decision rows, element codes used anywhere in the document,
element codes defined in the target-architecture section, verification rows, evidence rows, declared
gaps. Every code used has a definition — a code that appears only in a work item or a verification
row is defined or deleted.

## 7. After writing

Report where it went, how long it is, the counts from section 6, and how many citations you resolved
yourself against how many you did not — "the rest resolve" is a claim you did not check. Then say
plainly what is not yet settled in it: the declared gaps, and anything you were unable to verify. Offer `fd3:validate-spec` on the file as the next step —
it will spot-check the appendix, resolve every citation and run the section checks — and let the user
decide whether to run it.

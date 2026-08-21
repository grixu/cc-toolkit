---
name: validate-spec
description: Validate a spec for implementation readiness, backing every load-bearing claim with recorded evidence. Use when the user wants a SPEC, PRD or design document checked before implementation or before splitting it into tasks.
argument-hint: "<path to the spec file>"
---

The spec to validate: **$ARGUMENTS**

If no path was given, ask which spec to validate. If the path does not resolve, say so and stop.

**That spec file is the only file you may edit.** Everything else you read is read-only, no matter
what you find in it.

## Goal

Decide whether the spec can be implemented, or split into tasks, as written. It can when every
load-bearing claim is verified or deferred to a named owner, and no check in step 2 is left open.

## Terms

- **Claim** — anything the spec asserts that must hold for it to be implementable: a design decision, a
  prerequisite, a stated fact, a judgement that some permission or code path is unused.
- **Element** — anything the spec says will be built, cited by its **element code** (`DB-1`, `API-2`).
  The template defines both.
- **Section** — one numbered section of the spec. Evidence is grouped by section, never per claim.
- A claim is `verified`, `deferred`, `open` or `blocked`:
  - `verified` — the evidence holds.
  - `deferred` — the spec declares the gap and names both an owner and a placement. This passes.
  - `blocked` — nothing settles it and the spec names no owner and no placement.
  - `open` — not yet settled during this run.

The shape a spec is measured against is `${CLAUDE_SKILL_DIR}/../../references/spec-template.md`, and
the invariants it is measured against are in `${CLAUDE_SKILL_DIR}/../../references/spec-rules.md`.
Read both before step 2 — checks 3, 7, 10 and 11 are section-level questions the template answers, and
checks 1, 6 and 12 are rules the other file states.

## Workflow

Post this checklist before your first tool call, and post it again with the marks updated each time a
step completes — it is how the user sees progress:

```
- [ ] 0. Locate every repository the spec touches
- [ ] 1. Enumerate claims, elements and stated decisions
- [ ] 2. Run the spec-level checks
- [ ] 3. Verify the evidence, and gather what is missing
- [ ] 4. Put everything still ambiguous to the user, in one batch
- [ ] 5. Apply the answers, re-enter step 3 for claims still open
- [ ] 6. Report the verdict
```

**Headless.** A dispatch may declare this run headless — the `fd3:build-spec` orchestration
does. Then nothing here talks to the user: execute steps 0–3, write the report-so-far to the
file the dispatch names, with the collected step-4 questions under `## Questions for the user`
and the claims they would settle marked `awaiting-user`, and return that file's path plus one
line per question. The caller asks the user; a second headless dispatch — the **apply run** —
receives the answers and the partial report's path, executes steps 5 and 6 against them, and
produces the final report. The no-open-claims rule binds the final report, never the partial
one.

### 0. Locate the repositories

A spec often describes work in repositories other than the one it lives in. List every repository it
names and resolve each to a local path. Ask the user for the ones you cannot find — that is knowledge
about their machine, not a fact you can look up. A repository still unresolved goes into "Not
validated" in the report; never report its files as missing.

Then bring every resolved repository up to date: `git fetch`, and check whether the local tree is
behind the branch the spec describes. A clone a day behind produces false citation drift, and
"correcting" the spec against it rewrites a correct document backwards. Record the commit each
repository is checked against, and put that commit in every dispatch prompt that targets it.

### 1. Enumerate

Read the spec in full and record, in this order:

1. Any declaration of precedence over another document — what it supersedes, and on what.
2. Every design decision, element and claim.
3. Every acceptance criterion. When the spec states none, that is the first finding of the report; derive
   criteria only for the elements that gate delivery, never one per verifiable requirement.

Open every document the spec references. A reference you cannot open is a finding. A document the spec
supersedes is context, not an authority: read it to detect silent reversals, never to contradict the spec.

### 2. Spec-level checks

Every check below passes in two ways: the spec supplies the fact, or the spec declares the gap on the
terms `spec-rules.md` sets. A gap declared without an owner and a placement is the finding; a gap the spec
already owns and places is a pass.

Run these once over the enumeration from step 1 — they are properties of the whole document. Each yields a
pass or a finding that names the spec section it came from, and **every one of the twelve gets a row in the
report**, whether it passed or not.

1. Design decisions do not contradict one another within the authoritative set. Where the spec declares
   precedence over another document, that declaration settles the disagreement; what to look for instead is
   the **silent reversal** — something the superseded document said, changed here, and not marked as changed.
   A categorical claim that everything else is carried forward is itself a claim: check it, or report it.
   Contradiction is also intra-element: an element whose own requirements cannot all hold at once — a
   mandated mode and a mandated mechanism that only works in a different mode — is the same finding, and it
   surfaces later as an implementation agent blocking mid-run, at the cost of a whole extra cycle.
2. The described scope covers every design decision, and every part of the scope traces back to one. What
   the spec puts out of scope is exempt from this — instead, each out-of-scope item names its owner and its
   placement. Check every out-of-scope item against the rest of the document: an item whose body describes
   work the spec actually does is in scope, and the contradiction is the finding.
3. Every element has a description, a schema or pseudocode, and carries its element code.
4. Every dependency exists already, is planned in the spec, or is deferred with an owner and a gate.
5. Every external contract — third-party API, SDK, protocol — is confirmed against its documentation, or
   names the substitute that stands in where the documentation is silent.
6. Every referenced document exists, is readable, and is named precisely enough to open.
7. Each element's contract is complete: fields, types, errors, auth, limits.
8. The build order of the elements is stated, and it holds given the dependencies.
9. The spec is achievable in this project — its stack, its architecture, its conventions.
10. The spec is splittable into tasks: no gap or unstated assumption visible at spec level.
11. Every element has a stated way to check the delivered result.
12. No claim rests on a vague verb or an undecided either/or, as `spec-rules.md` defines them.

### 3. Evidence

The spec's own verification table — a `Claim | How it was verified` table, whatever its heading — is the
record. Spot-check its rows and append to it under a dated sub-heading, so the spec's original evidence
stays distinguishable from this run's. When the spec has none, add one at the end. A file at
`<spec-dir>/evidence/<section>.md` is for overflow only: a probe transcript or a command output too long to
sit in a table row.

Spot-check every row whose claim gates a phase or is the sole justification for removing or narrowing
something, plus a sample of the rest, and say in the report which rows you checked. "17 rows checked" with
no rule behind the 17 tells the reader nothing.

Split the cost of verification:

- **Every reference the spec cites must resolve.** A `path:line` that no longer points at what the spec
  says it does is a finding — stale citations are the most common rot in a spec of any age. This is
  mechanical: batch it per repository. A citation that resolves to the wrong line is an unambiguous fact,
  not a question: correct the citation in the spec. Reporting it and leaving it is the one outcome that
  helps nobody.
- **Re-derive in full** only the claims that gate a phase, or that are the sole justification for removing
  or narrowing something. Take the rest at the spec's word once its citation resolves.

For a claim with no evidence, find the fact yourself — never ask the user for something you can look up.
Route every lookup by where the fact lives — the routes and dispatch rules are in
`${CLAUDE_SKILL_DIR}/../../references/fact-routes.md`; read that file before dispatching anything.

Tell each agent what it needs to work in the tree you are sending it to: the repository root, whether the
working tree is dirty, and which search tools function there. An agent that has to discover its own
constraints spends its budget on that instead of on your question.

Dispatch at most one agent per section, or one per repository when the claims are all reference checks in
the same tree — never one per claim. Within that ceiling, split any dispatch that has grown past
roughly five sub-questions, as `fact-routes.md` directs: several agents over exclusive territories
beat one agent carrying thirty claims. A repository here means one tree with one root, so two disjoint
subtrees of a monorepo that the spec treats as separate components may take one agent each — and
any partition into disjoint code territories works on the same terms, provided the territories
are exclusive and every prompt names the ones that belong to the other agents. An agent may
fan its own workload out further — that is its call, not a violation. Two constraints travel down with
it: every sub-agent gets the same tree context you gave its parent, and `fact-routes.md`'s dispatch
rules bind at every level.

**A sub-agent returns observations, not findings.** Resolve every identifier it reasoned about — a team
alias, an account, a role, a project, a version — before you record its conclusion. A report that a
claim is "inverted" because an unfamiliar name appeared instead of the expected one is an unresolved
identifier, not a finding, and recording it as one puts a false finding in front of the user.

The rest of a sub-agent's substantive observations do not die in its transcript either: each one ends
as a finding in the report, as a spec edit the report's edits list names, or as an explicitly dropped
item with its reason.

A discrepancy that arithmetic or one command settles is a fact, not an open item — settle it.
Recording it as unresolved, or pushing a reconciliation task into the spec's rollout, plants work in
the document that a subtraction would have closed.

Then, per claim:

- **The fact is unambiguous** — apply to the spec the smallest edit that records it, append the evidence
  row, set the claim `verified`. Edit only what the fact forces: do not rewrite, reformat or extend the
  spec, and do not touch a section no finding points at.
- **The spec declares the gap with an owner and a placement** — record it `deferred` with both, and move
  on. Do not put it to the user.
- **Anything else** — collect a question for step 4 and leave the claim `open`.

### 4. Ask the user

Ask every collected question at once, following the batching protocol in
`${CLAUDE_SKILL_DIR}/../../references/question-batching.md`. Then wait for the answers.

### 5. Apply

Per answer: when it settles the claim, apply the smallest spec edit that records it, append the evidence
row, and set the claim `verified`. When it opens a new fact to look up, re-enter step 3 — for the claims
still open only, never for one already settled.

Repeat 3–5 until every claim is `verified`, `deferred`, or `blocked` because nothing settles it and the spec
names no owner. A `blocked` claim goes into the report; do not put it to the user again. The run never
ends with a claim `open`: a claim you cannot settle before reporting becomes `blocked`, with the reason
it could not be settled stated in the report.

### 6. Report

Report against the shape in `${CLAUDE_SKILL_DIR}/../../references/validation-report.md`. Read that
file before writing anything.

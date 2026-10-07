# Rules that hold everywhere in a spec

The invariants a spec is written against and measured against, wherever the statement lands.
`write-spec` writes to them, `validate-spec` checks them, and `spec-template.md` assumes them in
every section.

- **A declared gap passes; an undeclared one does not.** Anything the spec cannot settle is fine
  if the spec says so and names both an **owner** and a **placement**. The spec's own team is the
  default owner, so an owner needs naming only when it is somebody else. A placement is the gate
  it blocks, the ticket number it moves to, or the verification substitute that stands in for a
  test — specific enough to act on. "Each gets its own ticket" with no number, or "the pending
  pull request" with nothing that identifies it, places nothing. A spec that documents its own
  gaps is the well-written one.
- **A deferred choice is not a gap.** A gap is a fact nobody can establish yet, or an action that
  happens outside the spec: a lawyer's sign-off, a vendor's answer, a probe that needs a deployed
  environment, a credential somebody has to create. A choice the spec's own team could make today
  — a design option, a value, a scope cut, a permission to touch a protected file — is an
  undecided either/or wherever it is placed: "decided at task split", "confirm at implementation"
  or "the team decides later" hands a question to a stage that can only stop and ask it. Where the
  choice genuinely turns on a fact that arrives later, the spec records the rule that decides it
  from that fact, and the fact is the gap.
- **No vague verb carries a claim.** "Handles", "supports", "properly", "as needed", "where
  appropriate" — each hides the decision a reader needs.
- **No undecided either/or.** "Redis or Postgres", "sync or async" with no decision recorded is a
  question wearing a statement's clothes. A choice consciously handed to a named owner is
  deferred, which is different.
- **Every citation resolves.** A `path:line` that no longer points at what the spec says it does
  is worse than no citation, because it reads as verified.
- **Elements are cited by code.** `API-2` names the same element for as long as the spec lives;
  "the second endpoint" and "section 4.2" both break the first time the document is reorganised.
- **Every referenced document is named precisely enough to open.** "The ADRs from last month" is
  not a reference.
- **Paths in a document are relative.** A source file is cited relative to its repository root, a
  sibling document relative to the citing document's directory. The local clone's location is this
  machine's state and belongs in nothing that outlives the session: name a repository by its remote
  name and the commit, never by `/Users/…`. The one exception is a path genuinely outside any
  repository — a scratchpad transcript an evidence row points at — and that row says so. Machine
  state a run hands to its own tooling — a task's frontmatter, a workflow's inputs — is not a
  document, and this rule does not reach it.
- **Sections are written as "section N", never as `§`.** The symbol survives no copy-paste chain
  intact, and it reads as a citation to something outside the document.

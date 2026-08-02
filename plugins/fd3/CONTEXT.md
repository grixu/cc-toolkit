# fd3 — Concepts

For the plugin's authors. Nothing at runtime reads this file — the agent-facing definitions live in
the skills and the template, and when they and this file disagree, the skills and the template win.

## The documents

- **Spec** — the deliverable: a document precise enough to implement, or split into tasks, without a
  second conversation. Written by `write-spec`, measured by `validate-spec`.
- **Template** (`references/spec-template.md`) — the twelve sections a spec is written against and
  measured against. Both skills point at it, so a section added here changes what `validate-spec`
  expects *and* what `write-spec` writes.
- **Spec rules** (`references/spec-rules.md`) — the invariants that hold in every section, split out
  of the template because they bind statements rather than sections: declared gaps, vague verbs,
  undecided either/ors, citations, element codes, document references. The single source of truth
  for all three, so neither skill restates them.
- **Output shapes** — every document fd3 produces has its shape in `references/`: the spec in the
  template, the validation report in `validation-report.md`, a task file in `task-template.md`. A
  skill points at its shape; it never inlines one.
- **Closing summary** — grill-topic's final artifact: every settled decision, plus the decisions the
  user never answered directly. The user confirming it is the gate between grilling and writing.

## Identity and traceability

- **Element** — anything the spec says will be built: an endpoint, a table, a module, a job, an
  infrastructure resource.
- **Element code** — the element's permanent identifier: a category prefix plus an ordinal (`DB-1`,
  `API-2`). Categories: `DB`, `API`, `CONFIG`, `OBSERVABILITY`, `UI`, `INTEGRATION`, `TEST`,
  `INFRA`, `DOCS`, `CICD`. Assigned where the element is defined (template section 4) and
  write-once — never renumbered, never reused. Exists so work items, verification rows, evidence
  claims and future task files can cite an element in a way that survives reorganising the prose.
  It is also the unit a task split traces: coverage means every code lands in some task.
- **Decision (`D1`…`Dn`)** — a choice the user ratified, with the rationale that settles it and the
  cost that was accepted. Lives in the decision table (template section 3); the rest of the
  document cites decisions by number.
- **Claim** — anything the spec asserts that must hold for it to be implementable. During
  validation a claim is `verified`, `deferred`, `open` or `blocked` — defined in `validate-spec`'s
  Terms section.

## Gaps and precedence

- **Declared gap** — something the spec could not settle, stated as such with an **owner** (who
  resolves it; the spec's own team by default) and a **placement** (the gate it blocks, the ticket
  number, or the verification substitute). A declared gap passes validation; an undeclared one is a
  finding.
- **Precedence declaration** — the header statement of what this spec supersedes and who wins on
  disagreement, followed by the enumerated reversals.
- **Silent reversal** — a decision a superseded document made, changed here, and not marked as
  changed. What validation check 1 hunts.

## Grilling

- **Design tree** — the decision structure of a topic: every decision branches into the decisions
  that hang off it.
- **Frontier** — every decision whose prerequisites are already settled. A round asks the whole
  frontier and nothing beyond it.
- **Round** — one batch of numbered questions, each with named options and a marked recommendation;
  the answers reshape the tree and the frontier is recomputed.
- **Carried-over question** — a question the user skipped, re-put in the next round. Silence is not
  assent.

## Facts and evidence

- **Fact routes** — where lookups go: the codebase via `Explore`, documentation and prior art via
  `fd3:researcher`, the live system via `general-purpose` running the CLI the answer needs. Live
  state is authoritative over both code and documentation, and it is the only place drift shows.
- **Evidence record** — the spec's `Claim | How it was verified` table (template section 12). The
  spec's proof of work; a claim that rests on inference must say so.
- **Verification kinds** — probes (runnable on demand), triggered (exercised by using the feature),
  observed only (needs a state you cannot create; the substitute is named and called observation,
  not a test).

## Tasks

- **Task** — the smallest set of a spec's work items that is independently verifiable and leaves
  its repository mergeable. **One task = one branch = one worktree = one pull request** — an
  identity `split-to-tasks` enforces, not a guideline. A repository always cuts, even under a single
  owner; inside a monorepo, ownership (one review-and-apply owner per subtree) cuts.
- **Operational task** — the sanctioned exception to that identity: hand-run work against the live
  system (`gcloud`, a console) with no pull request, existing because a spec gate needs an owner
  and no repository carries it. Frontmatter: `repository: none`, `branch` empty; body closes with
  a `## Note` saying why. The frontmatter stays machine-readable — prose in those fields breaks
  whatever parses them.
- **Index card rule** — a task file carries pointers (element codes, section headings), never
  copies of spec content. The spec stays the single source of truth; with hashing rejected, a
  copied contract that rots is undetectable.
- **Task statuses** — `todo`, `in-progress`, `ci`, `cr`, `fixing`, `done`. `ci` marks build/lint/
  stage verification, `cr` the configured review skills, `fixing` a failed stage being repaired.
  Stage-granular because a mass implementation run can be interrupted by usage limits and must
  resume knowing what each task already passed.
- **Size policy** — split further above 80 changed files or 2000 changed lines, generated files
  excluded. Defaults of `split-to-tasks`, user-overridable; policy lives in the skill, never in
  the spec.

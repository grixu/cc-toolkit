# comment-review rules — R1–R12, exceptions, and false-positive traps

This is the full rule set for Step 3 of the skill. Read it whole before judging
comments; the one-line index in SKILL.md is only a map, not a substitute. Run the
**deletion test** (SKILL.md intro) on every comment first — most findings fall
out of it directly.

## Contents
- Preamble — a "note" prefix buys nothing
- R1 — No narrating *what* the code does
- R2 — Comments should explain *decisions* (the WHY)
- R3 — Not too long
- R4 — No references to other files, internal docs, or spec/requirement IDs
- R5 — No banner / section-divider comments
- R6 — No change-state / history comments
- R7 — No process-narration disguised as a decision
- R8 — No commented-out code
- R9 — No comment that contradicts the code (fix-first)
- R10 — Consistent with the file's commenting style
- R11 — In test files, the bar is much higher
- R12 — Rationale belongs where the behavior lives
- Always KEEP (never flag)
- Doc comments follow language convention, not R1
- False-positive traps (the calibration that separates a good review from a noisy one)

When two rules collide, the most specific finding wins; when genuinely unsure,
default to KEEP and move on (low signal is worse than a missed nitpick) — **except
in test files, where R11 reverses this to default-REMOVE.**

## Preamble — a "note" prefix buys nothing
`AGENTS-NOTE:`, `NOTE:`, `NB:`, `IMPORTANT:` and the like only mark that *the
author* thought the comment mattered — they are not themselves a why, and they do
not exempt the comment from any rule. Strip the prefix and judge what remains on
its merits: if the remainder restates the code (R1) or points at an internal doc
(R4), it goes despite the label.

## R1 — No narrating *what* the code does
The code is there to be read. A comment that restates what the code below *is* or
*does* — in prose, at any level of abstraction — adds nothing.

- **REMOVE** when the comment's meaning is already contained in the code it sits
  on: the next line's identifiers/operators, **or the block / data structure
  below it**. A prose summary of a map/`Record` literal is still narration:
  ```ts
  // increment the counter
  counter++;
  ```
  ```ts
  // Required NewAudit type sets per report; SEO needs all four sub-audits.
  const REQUIRED_AUDIT_TYPES: Record<ReportType, AuditType[]> = {
    /* …the literal lists exactly these sets, key by key… */
  };
  ```
  The second comment names what the map already spells out. Raising the
  abstraction ("type sets per report") or invoking a domain noun does **not** turn
  a restatement into a *why* — it is the same fact in prose. This is the most
  common disguise: a comment that *sounds* like a domain rule but only summarizes
  the declaration beneath it.
- **Exception → KEEP**: a genuinely complex algorithm (non-trivial math, a
  tricky state machine, bit-twiddling, an intentionally unusual loop) where a
  one-line "what" makes the mechanism graspable. The bar is *complex*, not
  *unfamiliar to a junior*.

## R2 — Comments should explain *decisions* (the WHY)
The comments worth keeping say why the code is the way it is — the constraint,
the trade-off, the gotcha that the code itself cannot show.

- **KEEP** decision/rationale comments (`// sequential, because the upstream
  rate-limits per source IP`).
- **REWRITE** a "what" comment into a "why" when a real reason exists but the
  comment states the mechanics instead.
- Surface a **missing WHY** as a finding (suggest the comment text) only at
  *non-obvious* code: magic constants, workarounds, surprising/inverted logic,
  silent catch blocks, specific timeouts/retries/batch sizes.
- **Exception**: do **not** demand a comment on obvious code or on very common,
  well-known patterns (a standard getter, a plain map/filter, a textbook
  singleton). Asking for a WHY there is just noise.

## R3 — Not too long
A comment should be as short as the idea allows.

- **REWRITE** when, for non-algorithmic code, the comment runs **longer than the
  code it annotates** or **exceeds ~2 sentences** — trim to the single
  load-bearing sentence (or remove it if the signature already says everything).
  Prefer one tight line over a paragraph.
- The threshold relaxes for the R1/R7 algorithm exception: a genuinely complex
  mechanism may justify a few lines. Length alone is never the finding there —
  pair R3 with *what is actually load-bearing*.

## R4 — No references to other files, internal docs, or spec/requirement IDs
A comment should stand on its own at the point of code. A pointer to another
file or to an internal project doc rots the moment either side moves, and it
hides coupling: the reader has to leave the code to understand the code.

- **REMOVE / REWRITE** any comment that sends the reader elsewhere *inside the
  repo* — another source file ("see `utils/foo.ts`", "logic lives in
  `handler.ts`") **or** an internal doc / section anchor ("as described in the
  design doc", `DD_ARCH.md §3.2`, `DD_PLAN.md T4.1`, a Confluence/Notion link).
  Rewrite so the load-bearing fact lives **in the comment**, then drop the
  pointer. If the real content is too big to inline, that is the signal it
  belongs in the doc, not the code — keep only the one constraint that actually
  affects this code, stated plainly, with no citation.
- **Terse spec / requirement-ID tokens count too — even with no filename.** The
  rot here is rarely a tidy `DD_PLAN.md` path; far more often it is a bare code
  glued into the prose that points at a slot in a spec, requirements list,
  design doc, or planning artifact: `F1`, `Q1`, `R2`, `§4.1`, `$4.1`, `T4.1`,
  `AC-3`, `US-12`, `REQ-7`, `step 3 of the plan`. It is the same defect as a
  file path, only shorter and easier to miss — the reader still cannot resolve
  it without the external doc, and it breaks silently the moment the spec is
  renumbered. **The tell:** an alphanumeric code — a letter+number (`F1`, `Q1`,
  `R2`), a section number with `§`/`$`/`#` (`§4.1`, `$4.1`), or a `PREFIX-N` id
  (`AC-3`, `US-12`) — that names a *position in a document you control* rather
  than stating a fact. Do not wave it through because it is short or reads like a
  label. Handle it exactly like any R4 ref: strip the token, keep the
  load-bearing sentence; if the comment is *only* the token, nothing survives the
  strip → **REMOVE**.
  ```ts
  // F1: users can reset their password   → delete — what is left ("users can reset
                                          //   their password") is R1 narration of the code
  // dedupe before insert (R2)            → // dedupe before insert
  // see Q1                               → delete — a pure pointer, nothing survives
  // §4.1 caps the batch at 500           → // batch capped at 500 (hard limit)
  ```
  The fragment is the leak: it is fine to keep the real constraint, but the
  `(R2)`, the `F1:`, the `§4.1` must not ride along into the kept comment.
- **No "provenance" loophole.** A doc/file ref glued onto an otherwise
  self-contained sentence still goes (`// that hard-stop is intentional
  (DD_PLAN.md T4.1)` → `// that hard-stop is intentional`). The test is simple:
  if the sentence reads fine with the ref deleted, the ref was dead weight —
  delete it. Design provenance belongs in the doc; change provenance belongs in
  git; neither belongs inline. (Contrast R6, which keeps a *ticket id* only when
  it tags a live external constraint — an internal doc you control is not that.)
- **Exception → KEEP**: a stable, **external**, pinned reference that is
  genuinely load-bearing and cannot be inlined — an RFC number, a published spec
  section, a CVE id, or a URL pinned to a commit/version. Internal repo files and
  internal project docs never qualify, no matter how stable they feel. Plain
  "latest" links still get flagged to pin or drop.

## R5 — No banner / section-divider comments
A row of `=`, `-`, `*`, or `#` fencing a label is decoration. Function
boundaries, file layout, and ordering already provide structure; the divider
just adds visual noise that drifts out of sync with the code beneath it.

- **REMOVE** the divider **whether it is empty or carries a descriptive
  title** — the label does not redeem the fence. Both of these go:
  ```
  // ============================================================
  // PERFORMANCE
  // ============================================================
  ```
  ```
  # -----------------------------------------------------------------------------
  # DD GCP integration — per-env SA + STS registration
  # -----------------------------------------------------------------------------
  ```
  If the title carries a real constraint or rationale, keep **that one sentence**
  as a plain comment and delete the fence rows; if it only labels the next block,
  delete the whole thing.
- **"The file is long and flat" is not a reason to keep them.** A file that
  needs dividers to be navigable should be split, or its sections turned into
  real functions/modules — say so, but the banner still goes; keeping it just
  freezes the smell in place. A repo-wide *convention* of decorative dividers is
  still R5 — flag it rather than grandfathering it in.

## R6 — No change-state / history comments
What changed and why-it-changed lives in version control, not in the source.

- **REMOVE** comments that describe the diff or a prior state: PR/ticket numbers
  (`// fixed in PROJ-123`, `// see #456`), and phrasing like *previously*,
  *changed from*, *was X, now Y*, *old behavior*, *temporary until the migration*.
  The commit message / blame is where this belongs.
- **REMOVE** migration / old-vs-new *mapping* comments — prose whose content is
  the relationship between a former schema/behavior and the current one
  (`// Legacy run stored Analysis.id refs that match no NewAudit row → facade
  returns []`). That the old shape no longer matches is migration context: it
  documents the change, not what the code must do today. The present-day behavior
  ("unmatched ids → empty result") should be readable from the code or stated
  plainly without the historical framing; the "legacy stored X" half belongs in
  the migration PR. "The reader won't remember the old structure" is precisely
  *why* it goes to git history — not a reason to freeze it inline.
- **Exception → KEEP**: a comment that documents a **present-day constraint**,
  even when it carries a ticket id — e.g. `// Farmer rejects org-owner creds
  (PL-5276)` explaining why the code does what it does *right now*. The id here
  is provenance for a live constraint, not a record of a past change. This
  covers both a still-open `TODO`/`FIXME` landmine and a plain rationale comment
  that happens to cite a ticket. What still goes under R6: closed-ticket
  breadcrumbs and "what changed" history (`// fixed in PROJ-123`, `// was X, now
  Y`).

## R7 — No process-narration disguised as a decision
A comment can *look* like a rationale but actually just narrates the
algorithm/process/state at the spot where a value is computed or assigned —
duplicating what the code already expresses.

- **REMOVE** when the comment merely re-describes how a value is built
  (`// take the first 10 and sort by date` above code that slices 10 and sorts
  by date). If that explanation has value, it belongs where the value is
  *produced/processed*, expressed in the code — not duplicated as prose.
- **Exception → KEEP**: when that narration is **critical to correctness**,
  **genuinely very complex**, or **security-relevant** (e.g. why an order of
  operations must not change, why a bound is exactly this value for a security
  reason). Keep those, ideally tightened to the load-bearing point.

## R8 — No commented-out code
Dead code parked in a comment is the diff's job, not the file's. Version control
already keeps the old version; a commented-out block just rots and confuses.

- **REMOVE** lines that are commented-out statements/expressions rather than
  prose: `// const old = legacy(user)`, a `#`-prefixed block of former Python,
  an `/* ... */` wrapping a previous implementation.
- **How to tell it apart from a prose comment:** strip the comment marker and
  ask whether the remainder is *code* (parses as a statement, has assignments /
  calls / brackets) rather than a sentence. If it's code → R8.
- **Exception → KEEP**: a short snippet that is genuinely illustrative *as
  documentation* (a usage example in a doc comment), clearly framed as an
  example, not an abandoned line.

## R9 — No comment that contradicts the code (fix-first)
A comment that actively lies about what the code does is the worst defect here:
a reader trusts it and is misled. Surface these **first**, ahead of every
noise-level finding.

- **REWRITE** (or REMOVE if redundant) when the comment asserts behavior the
  code beside it does not have: `// returns true on success` above a function
  that returns the error object; `// retries 3×` above a single attempt; a
  param doc naming the wrong unit/range.
- This is a semantic check — you must have read the code to claim it. Never
  raise R9 on suspicion; cite the exact line of code that contradicts the
  comment.
- On **modified files**, this is where rot shows up: code changed, comment
  didn't. Re-read the comment against the *new* code, not the touched lines.

## R10 — Consistent with the file's commenting style
Comments are part of a file's texture. One comment that breaks the file's own
convention reads as an afterthought and almost always marks low-value prose.

- **REMOVE / REWRITE** a comment out of step with how the rest of the file
  comments comparable code. The clearest tell: sibling declarations of the same
  kind are left bare, and one of them carries a trivial doc/line comment.
  ```ts
  /** First (findings) query/params. */
  function findingsCall(bq) { return bq.query.mock.calls[0][0]; }
  function suggestionsCalls(bq) { return bq.query.mock.calls.slice(1); }  // ← bare, same kind
  ```
  The lone `/** … */` adds nothing the name doesn't and clashes with its
  un-commented sibling — drop it. The file's *consistent* choice is no doc on
  these helpers; match it.
- Also covers mixed register: a stray `/** */` doc-block among `//` line
  comments, or a verbose paragraph where the file otherwise keeps to one line.
- **The fix is consistency, not uniformity for its own sake.** If the
  inconsistent comment is the *load-bearing* one (a real WHY its siblings lack),
  keep it — and consider whether the siblings now need one too. Style is the
  tie-breaker for low-value comments, never a reason to delete a genuine why.

## R11 — In test files, the bar is much higher
Tests are read top-to-bottom as an executable spec; the assertions *are* the
documentation. A comment that narrates what the test does, or how the
implementation under test behaves, states the same thing twice and rots when
either side moves. **In test files, the Step 3 "when in doubt, KEEP" default is
reversed: when in doubt, the comment goes** — the spec reads fine without it.

- **REMOVE** test comments that restate the test's mechanics or the
  implementation's behavior, even when phrased as insight:
  - `// Exactly one facade read for all runs (not per-run); distinct ids only.`
    → the `toHaveBeenCalledTimes(1)` assertion below already says it.
  - `// Namespace-scoped facade read across all stored ids — no direct
    prisma.analysis access.` → binds the test's prose to an implementation detail
    (R1 + coupling); the test will lie the moment the impl changes.
  - `// agentRun.create stores the resolved NewAudit ids (not the dispatcher
    contract).` → narrates impl behavior the assertion already checks.
  - `// Duplicate + unsorted urls — the service Set-dedupes and sorts.` →
    describes what the code under test does; the fixture + assertion show it.
- **KEEP** only *structural / scenario* labels not recoverable from the code:
  `// Arrange` / `// Act` / `// Assert`, `// given an expired token`, numbered
  steps in an e2e flow, or a genuine non-obvious *why a fixture is shaped this
  way* (a real gotcha — not a description of the shape).

## R12 — Rationale belongs where the behavior lives (no orphaned / duplicated *why*)
A comment can clear R1/R2 as a genuine *why* and **still** be in the wrong place:
pinned to a *declaration* — an enum member, a constant, a type/DTO field, a
log-code definition — while the reason it states is about the **behavior of code
elsewhere** that emits, reads, or acts on that value. At the declaration the
reader only needs what the identifier *means*; the constraint/trade-off/gotcha
lands on whoever is reading the method that implements it.

- **The tell:** the comment's load-bearing clause describes runtime behavior — a
  verb about what some code *does* or *can't do* ("the conditional UPDATE can't
  distinguish a missing row from an ineligible status", "we retry twice before
  giving up", "fails silently when the row is already gone") — but it sits on a
  line that only *names a value*. The declaration neither performs nor enforces
  that behavior, so the *why* is orphaned from its code.
  ```ts
  export enum AuditDlqInfoCode {
    DLQ_MESSAGE_RECEIVED = 'audit.dlq.message.received',
    // One no-op code — the conditional UPDATE can't distinguish a missing row
    // from an ineligible status
    DLQ_STATUS_NOT_ELIGIBLE = 'audit.dlq.no_op.status_not_eligible',
  }
  ```
  The rationale is real, but it explains the handler's UPDATE, not the string
  constant. A reader of the enum cannot act on it; a reader of the handler needs
  it.
- **Locate the destination (best-effort).** `Grep`/`Glob` for the declared
  symbol to find where it is actually used. This serves two ends: it lets you
  **name the concrete method** in the suggested fix, and it tells you whether the
  rationale is **already present** there. Do not block the finding on the search
  — if the symbol is used in many places or the search is inconclusive, still
  flag the misplacement and point at "the method that performs the behavior" in
  general terms.
- **REMOVE** when the same rationale already lives at the usage site — the
  declaration copy is the redundant (duplicated) one; delete it and keep the
  authoritative copy where the behavior is.
- **MOVE** when the rationale exists *only* at the declaration: the suggested fix
  relocates the sentence to the implementing method and leaves the declaration
  bare (the identifier already says what the value is). MOVE is for comments
  whose **content is worth keeping but whose location is wrong** — never use it
  as a soft REMOVE for low-value prose (that is R1).
- **Contrast → KEEP at the declaration:** a comment that explains the *value's
  own meaning* and is needed at every use site — `// 0 means 'unbounded', not
  'disabled'`, `// EU-only region; never used for US tenants`, a unit/range note
  on a field. The test: does the sentence describe **this identifier's
  semantics** (stays — every reader of the value needs it) or **what some method
  does with it** (moves — only that method's reader needs it)?

## Always KEEP (never flag)
Type annotations (not comments), license/SPDX headers, framework-required tags
(`@deprecated`, `@internal`, `@param` on public APIs), tool directives
(`eslint-disable-next-line`, `// nolint`, `# type: ignore`), and genuine
decision/rationale comments per R2.

## Doc comments follow language convention, not R1
Idiomatic public-API doc comments are required form, not narration: Go godoc
(must open with the symbol name — `// ParseConfig reads …`), Rust `///` / `//!`,
Python module/class/function docstrings, JSDoc/TSDoc on exported APIs. Do **not**
flag their *existence* under R1. Still judge them on **R3** (trim boilerplate
that only restates the signature), **R9** (the doc must not lie about the code),
and R7's exception (keep a genuinely complex explanation). The convention buys
the comment's right to exist; it does not exempt it from being correct and tight.

## False-positive traps (the calibration that separates a good review from a noisy one)

Each rule has a look-alike that is *not* a violation. Check these before
emitting — a wrong REMOVE is worse than a missed nitpick.

- **R1 vs self-documenting markup** — JSX/template props and declarative config
  read like "comment == code" by convention (`<Button label="Save"/>`,
  `timeout: 30_000  # 30s`). Do **not** flag the absence or presence here; the
  markup *is* the documentation.
- **R5 vs a real diagram** — ASCII art that *encodes information* (a state
  machine, a sequence/ordering, a box-and-arrow layout, a table) is load-bearing:
  removing it would lose information, so keep it. A fence of `=`/`-`/`*` around a
  *label* loses nothing when deleted — that is R5 whether the label is empty
  (`===== SECTION =====`) or descriptive (`----- Provider credentials -----`).
- **R6 vs a present-tense landmine** — `// TODO: remove once Safari <16 is dropped`
  warns about today's constraint; keep it. `// fixed the Safari bug (PROJ-12)`
  describes the past; remove it. The tense and whether the work is *still open*
  decide it, not the presence of a ticket id.
- **R7 vs a genuine invariant** — `// must run before auth(); sets the tenant
  context the guard reads` looks like narration but states an ordering
  contract the code cannot enforce. Keep. Narration that just re-says the
  visible mechanics (`// sort by date`) goes.
- **Tests / fixtures** — only *structural* labels are safe vocabulary:
  `// Arrange / Act / Assert`, `// given …`, numbered e2e steps. Everything else
  in a test file is subject to R11 (and R1): a comment that restates an assertion
  or the implementation under test is noise, not vocabulary. The trap here is the
  opposite of over-flagging — do **not** wave a test comment through just because
  it sits in a spec file.
- **Modified files** — when a comment sits above code the diff just changed,
  check whether the comment still matches the *new* code (a rotted comment is a
  REWRITE/REMOVE under R1/R7), not just whether the comment line itself was
  touched.
- **R4 spec-id vs a real external pin or genuine value** — a terse code is only an
  R4 ref when it points into an *internal* doc you control. A **stable external
  pin stays**: `RFC 9110 §10.2.4`, `CVE-2024-1234`, a W3C/ECMA clause, an ISO
  section — these are R4's KEEP exception, not requirement IDs. And a code that is
  actually a **value the code uses** is not a reference at all: a semver (`v4.1`),
  a hardware revision the product really ships (`Rev R2`), an enum/string literal
  whose text happens to be `R2` — judge those by what the code does, not as a doc
  pointer. When you are unsure whether `R2` is a spec slot or a real value, look at
  the code beside it: if some identifier or literal *is* that token, it is a value;
  if the token only appears in the prose, it is a reference. (Separately: when you
  cite your own findings in the report, your rule labels are also `R1`–`R12` — keep
  the user's `R2`-in-a-comment distinct from "this finding matches R-something" so
  the report does not read as circular.)
- **R12 vs a value-meaning note** — a comment on a declaration that explains the
  *identifier's own semantics* stays put (`// 0 means 'unbounded'`,
  `// sentinel; never persisted`): every reader of the value needs it, so it is
  correctly located. R12 only fires when the load-bearing clause is about *what a
  method does* with the value, not about *what the value is*. Don't MOVE a note
  that the call site genuinely depends on.

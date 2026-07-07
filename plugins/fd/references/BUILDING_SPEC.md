# BUILDING_SPEC — what a spec is, its format, and its validation

A spec is the single source of truth for one feature: a human-readable, complete
requirements contract. This file tells you how it must look and when it is ready. Specs
are built through the shared grill (the GRILLING reference block, loaded by the command alongside this one), driven from `/fd:start`
(a topic) or `/fd:from-docs` (documents), and refined through `/fd:grill`.

## What a spec is

A readable, complete requirements contract for a single feature. It contains **no real
code** — it expresses requirements through prose, diagrams, and pseudocode. It is precise
enough to be validated and split into self-contained tasks, and general enough not to
settle decisions that belong to implementation.

## Format and content rules

- **Readable, no internal jargon.** Common SWE abbreviations are fine (AC, FR, NFR with
  numbers). Do not refer to anything by paragraph symbol or internal slot — the document
  must stand alone.
- **Elements as anchored blocks.** Each buildable thing is a block whose heading is the
  anchor. The anchor grammar, exactly: a Markdown heading of level 1–6, then `KIND-n`,
  then a space, an em dash, a space, then the title — matched by
  `^(#{1,6}) ([A-Z]{2,16})-([1-9][0-9]*) — `. `KIND` is 2–16 uppercase letters drawn from
  the manifest's `idCounters` dictionary; the seed set is **DB, API, CONFIG,
  OBSERVABILITY, INFRASTRUCTURE, INTEGRATION, MODULE, DESIGN, AC, FR, NFR**. `n` is an
  integer ≥ 1 with no leading zeros. Example:
  `#### DB-3 — User table`. A block runs from its anchor heading to the next heading of
  equal-or-higher level (level ≤ the anchor's), or end of file; the heading line itself is
  part of the block. Headings that don't match the pattern are not elements. A heading
  that matches the pattern but whose `KIND` is outside the dictionary is **not** silently a
  new kind — structural-consistency validation flags it for a human decision (accept the
  new `KIND`, adding it to `idCounters`, or fix the typo). Group sections by `KIND`; the
  prefix acts as a completeness checklist.
- **Complete requirements.** List everything that must be built, at a general level (no
  concrete names unless several elements of the same kind exist and a name distinguishes
  them). Elements include, at least: database table definitions; API endpoints with their
  parameters and data types (they need not be exact when that follows from implementation
  stages — but indicate the format, e.g. "the one defined by `X`"); configurations and
  their default values; observability, infrastructure, and integration points.
- **FR and NFR** are included and numbered.
- **AC** completely cover the FR/NFR and link to them. The link lives **inside the AC
  block** as a `covers:` line — e.g. `covers: FR-2, NFR-1` under `#### AC-5`. It enters
  the block's hash, so a mapping change goes through invalidation. `ac-map.json` is a
  script-computed projection of these lines, never a second source of truth. Each AC binds
  **exactly one observable behavior** — no vague verbs, no either-or constructions.
  - **AC template.** Write each AC as a concrete **trigger → observable outcome**: exactly
    one observable behavior, no vague verbs (`handle`, `support`, `properly`), no either-or,
    and a mandatory `covers:` line.
    - Good: `When a charge request repeats an Idempotency-Key seen in the last 24h, the API
      returns the original charge result and creates no second charge.` `covers: FR-2`
    - Bad: `The system properly handles duplicate or invalid charge requests.` (vague verb,
      two behaviors, no trigger)
- **Edge cases and critical errors** are described, together with whether and how they are
  handled.
- **Deploy / rollback** may be noted, but without detailed procedures. When a procedure is
  genuinely needed, produce it in a separate subagent and store it in a separate file
  linked from the spec.

## Language

Write the spec — and its derived artifacts (tasks, ADRs, `CONTEXT.md`) — in the configured
language (`language.default`, default `en`), overridable per command invocation; record
the chosen language in `state.json.language`. Exception for shared mode: when `CONTEXT.md`
or ADRs are shared across features, they use the config default language with no
per-feature override — a shared artifact must not carry a language conflict.

## Validation — the spec Definition of Ready

Validation runs as the tail step of every command that produces a spec (`/fd:start`,
`/fd:from-docs`, `/fd:grill`), in **separate clean subagents — one per dimension**. A
checklist can never prove its own completeness, so checks are grouped into **dimensions**
(categories of "what can go wrong"), and the list is **v1, extensible** (config
`validation.dimensions.spec`).

### The six dimensions

1. **Structural consistency** — FR/NFR don't contradict one another; contracts are
   complete (tables, enums, state values); the order in which elements must be created is
   defined and correct. This dimension also raises the unknown-`KIND` decision above.
2. **Coverage** — AC completely cover FR/NFR and carry their links (the `covers:` lines;
   the `ac-map.json` projection); each AC binds exactly one observable behavior.
3. **Grounding** — every external contract (3rd-party / API / library) is confirmed by
   documentation with a quote in `sources-map.json`, and every reference to a user
   document exists and is loadable.
4. **Project feasibility** — the spec is technically realizable in this codebase (stack,
   architecture); each dependency either exists in the code **or** is planned in a
   dependent spec (referenced by path + hash — the plugin's CROSS_FEATURE reference).
5. **Decomposability / buildability** — two layers, below.
6. **Non-over-specification** — no real code where it isn't needed (unless it comes from a
   user's ADR or research); prefer descriptions, diagrams, pseudocode.

### Dimension 5, two layers

1. **Detail-level heuristics** (cheap filter): every contract is enumerated (tables,
   enums, state values), each AC is one observable behavior, and there are no vague verbs
   or either-or constructions.
2. **Decomposition dry-run** (hard test): attempt a trial partition of the spec's elements
   into buildable tasks — each element assigned to exactly one producing task, the task
   dependency graph acyclic, and every AC covered. If any element cannot be reduced to a
   buildable task because its contract is ambiguous or its set of elements is not
   enumerated, mark the spec `under-specified` — a blocker. This is the objective
   buildability test.

*(Optional extension point: a "completeness-critic" meta-subagent that asks "what's
missing, which dimension did we not check". Off by default — it is easy to turn into
noise.)*

### Gate semantics

- Every check is binary **pass / fail**; the model never degrades a fail to a warning.
  Every fail is a **blocker**.
- `verdict = ready` iff all checks pass; otherwise `blocked(failedChecks[])`. Write the
  verdict to `readiness.spec`.
- The verdict is **bound to `specHash`** (`validatedHash`). Any change to the spec —
  including a manual edit outside the commands — diverges the hash, which makes the verdict
  **stale and invalid**.
- Only a **human** lifts a block, through a conscious, logged **waiver** (per blocker);
  the model presents fails as fails and never auto-waives. A waiver is part of the verdict
  and **dies with it** on any `validatedHash` divergence. Re-validation is cheap: before
  overwriting the verdict, compare the previous `waivedChecks` against the new fails — if
  the same `checkId` still fails, show the previous waiver and ask for a one-confirmation
  replay (logged). No silent inheritance.
- Record `dimensionsRun` in the verdict — the dimensions actually executed — so that
  narrowing the set in config is visible in the validation report and in `/fd:status`,
  never silent.

## Versioning

The spec is content-versioned (Merkle). Changing an element diverges its `hash` and the
`specHash` rollup, which surgically invalidates exactly the dependent tasks and the DoR
verdict — nothing more. ID allocation is append-only: `/fd:grill` and `/fd:from-docs` keep
existing IDs and allocate new ones only for new elements.

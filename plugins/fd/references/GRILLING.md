# GRILLING — shared grill block (main thread)

The grill is an interactive requirements-drilling loop shared by `/fd:start`,
`/fd:from-docs`, and `/fd:grill`. It drives a feature's spec to a complete, internally
consistent state by closing gaps, resolving ambiguities and contradictions, grounding
every external claim, and maintaining the domain model. Run it **in the command's main
thread**, never as a subagent: the loop stands on questions to the user via
`AskUserQuestion`, which subagents cannot call. The three commands share this block and
differ only in what they feed in and in what they do after the loop ends.

## Input and output

Input depends on the calling command:
- **from `/fd:start`** — a topic from the user plus the project's code context.
- **from `/fd:from-docs`** — the analysis product: candidate FR/NFR/AC, a grill agenda,
  `CONTEXT.md`, and `sources-map.json`.
- **from `/fd:grill`** — an existing spec plus new user input (further drilling, or new
  information that reshapes requirements).

Output: an updated `spec.md` (elements as ID-anchored blocks; AC↔FR/NFR links written as
`covers:` lines inside AC blocks), an updated `CONTEXT.md`, and appended records in
`sources-map.json`. `ac-map.json` is **not** grill output — it is a projection a script
computes from the `covers:` lines. When the loop ends, save the spec and hand control
back to the owning command; that command runs spec validation as its tail. The grill
never writes implementation code and never runs validation itself.

## The agenda loop

Drive the conversation around an **agenda** — a list of open items in three classes:
- **gaps** — missing elements or acceptance criteria;
- **ambiguities** — vague verbs, undefined contracts, unspecified types or defaults;
- **contradictions** — FR/NFR that collide.

For `/fd:from-docs` the agenda arrives from the analysis; for `/fd:start` and
`/fd:grill` build it yourself from the topic or the existing spec. Work the items one at
a time with the user. **Every resolved item materializes immediately as a change in
`spec.md`**: a new or filled-in element block (with its ID), a new AC carrying a
`covers:` line, or a sharpened contract. Continue until the agenda is empty or the user
consciously closes it, then stop. Do not drift from requirements into implementation
decisions.

## Element IDs and the `covers:` line

Each buildable thing in the spec is a block anchored by a heading of the form
`#### <KIND>-<n> — Title` (e.g. `#### DB-3 — User table`), where `KIND` is 2–10
uppercase letters (seed kinds: DB, API, CFG, OBS, INF, INT, MOD, DESIGN, AC, FR, NFR)
and `<n>` is a positive integer with no leading zeros. **Be ID-aware:** keep every
existing ID exactly as it is, allocate a new ID only for a genuinely new element, and
**never renumber or reuse** a number. Allocation is append-only.

Record AC→FR/NFR coverage as a `covers:` line inside the AC block itself, e.g.
`covers: FR-2, NFR-1` under `#### AC-5`. This line is part of the block's content, and
therefore of its hash, so a mapping change is caught by invalidation. Never hand-write
`ac-map.json`; it is derived from these lines. Each AC must bind exactly one observable
behavior — no vague verbs, no either-or.

**AC template.** Write each AC as a concrete **trigger → observable outcome**: exactly one
observable behavior, no vague verbs (`handle`, `support`, `properly`), no either-or, and a
mandatory `covers:` line.
- Good: `When a charge request repeats an Idempotency-Key seen in the last 24h, the API
  returns the original charge result and creates no second charge.` `covers: FR-2`
- Bad: `The system properly handles duplicate or invalid charge requests.` (vague verb, two
  behaviors, no trigger)

## Grounding on-demand

Ground every external claim (an API, library, framework, or 3rd-party service) **the
moment it enters the spec**. Do not search or fetch in the main thread — delegate that to
the **researcher subagent**. When several claims need grounding, fan out N researcher
subagents (or batch them); each runs independently and returns a `{claim, fact, quote, source, anchors, groundedAt}`
record. Feed those records into `sources-map.json`. Keeping the fetch work in subagents
keeps the grill's context light and lets grounding run in parallel.

If the grounding tools are unreachable, the command computes `groundingDegraded` at
runtime from tool reachability and emits a warning; the grounding obligation then stays a
best-effort intention rather than a hard stop.

## CONTEXT.md and ADRs

Maintain the domain model in `CONTEXT.md` (format: the plugin's CONTEXT-FORMAT reference, loaded by the command alongside this block) and
record decisions as ADRs (format: the ADR-FORMAT reference, loaded the same way). Write them according to the
configured storage mode:
- **per-feature** — `CONTEXT.md` and `adr/` inside the feature directory.
- **shared** — `CONTEXT.md` per application / bounded context under the configured context
  root, ADRs under the configured ADR root. In shared mode the shared artifacts use the
  config **default** language (no per-feature override) — a shared artifact must not carry
  a language conflict.

In shared + per-bounded-context mode, the feature's bounded context comes from
`state.json.boundedContext`; use that to pick which `CONTEXT.md` to maintain.

The grill methodology (documentation-driven drilling plus domain modeling) and these two
formats are the plugin's own files; the plugin has no runtime dependency on external
skills. Attribution: inspired by mattpocock's skills (`grill-with-docs`,
`domain-modeling` — https://github.com/mattpocock/skills).

## Checkpoint to spec

Grilled content lives in the **spec**, the source of truth — not in session context.
Because of that, an interrupted grill resumes from the workspace, and adding a source
later (a `/fd:from-docs` re-run) is a reconcile, not a regeneration: the already-grilled
content survives because it is in the spec. The condition is that you **checkpoint the
current grill into the spec before any re-ingest**. When the loop ends, save the spec and
hand control back to the owning command, which runs validation and closes at its boundary.

# ADR-FORMAT — the Architecture Decision Record format

Record each architectural decision as **one ADR file**, so that a decision, its context,
and its consequences stay linkable and immutable. The grill records ADRs during grilling
sessions, whenever a decision shapes the domain or the spec. This exact format is what the
researcher subagent recognises as a **first-class, machine-linkable ADR source**.

## File and naming

- One decision per file, at `adr/NNNN-<kebab-slug>.md` (in shared mode, under the
  configured ADR root).
- `NNNN` is a zero-padded, **append-only** sequence number (`0001`, `0002`, …). Never reuse
  or renumber.

## Structure (frontmatter-less markdown)

- `# ADR-NNNN — Title` — the heading; title as a short noun phrase or imperative.
- **Status** — one of `proposed`, `accepted`, or `superseded by ADR-XXXX`.
- **Date** — ISO 8601 (`YYYY-MM-DD`).
- **Context** — the forces at play: the problem, constraints, and assumptions that make a
  decision necessary.
- **Decision** — what was decided, stated plainly and actively ("We will …").
- **Consequences** — the results, **both positive and negative** — what gets easier and
  what gets harder or riskier.
- **Alternatives considered** — each option weighed, with the reason it was rejected.

## Rules

- **Immutable once accepted.** Do not edit an accepted ADR to change its decision — write a
  new ADR and set the old one's status to `superseded by ADR-XXXX`. Only the status line
  may change on an accepted record.
- Record a decision **when it crystallises** during a grill, not retroactively.
- Keep one decision per file; a document that decides several things should be split.

## Skeleton

```markdown
# ADR-0007 — Store money as integer minor units

Status: accepted
Date: 2026-07-05

## Context
Prices and totals are computed and compared across the checkout flow. Floating-point
representations accumulate rounding error and make equality checks unreliable.

## Decision
We will represent all monetary amounts as integer minor units (e.g. cents), with the
currency carried alongside as an explicit field.

## Consequences
- Positive: exact arithmetic and equality; no rounding drift across the flow.
- Positive: serialisation is unambiguous.
- Negative: every boundary that displays or ingests a decimal amount must convert.
- Negative: mixed-currency operations must be guarded explicitly.

## Alternatives considered
- Floating-point amounts — rejected: rounding error breaks totals and equality.
- Decimal string type — rejected: pushes parsing and validation onto every consumer.
```

## Attribution

Format inspired by mattpocock's skills (`grill-with-docs`, `domain-modeling` —
https://github.com/mattpocock/skills).

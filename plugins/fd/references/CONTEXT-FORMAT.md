# CONTEXT-FORMAT — the CONTEXT.md domain-model format

`CONTEXT.md` is the feature's (or bounded context's) domain model: the ubiquitous language
that keeps the spec, the tasks, and the code talking about the same things in the same
words. The grill maintains it. Its job is consistency — every domain term the spec uses is
defined here, once, unambiguously.

## Rules

- **Update in place** — edit definitions as understanding sharpens; never keep an
  append-only change log (git holds history).
- **Total term coverage** — every domain term used in the spec must be defined here.
- **No implementation detail** — no class, table, or function names unless the name *is*
  the domain's own language.
- **One sentence per term** — behaviour-bearing, not a taxonomy.
- **Stable ordering** — Terms are alphabetical and use singular nouns; sections appear in
  the order below.

## Sections (in order)

1. **Overview** — one or two paragraphs: what this domain is about and the boundary of what
   it covers.
2. **Terms** — the ubiquitous language. One entry per term, `**Term** — definition`, each
   definition a single behaviour-bearing sentence. Alphabetical, singular nouns. Every term
   the spec uses must appear here.
3. **Aggregates & Relationships** — the domain objects: who owns what, the
   cardinalities between them, and any lifecycle notes (how an entity is created, changes
   state, and ends).
4. **Invariants & Policies** — numbered rules that must always hold in this domain.
5. **Out of scope** — what this domain deliberately does not cover, to stop
   scope creep and misused terms.
6. **Open questions** — unresolved points the grill has surfaced but not yet closed.

## Skeleton

```markdown
# CONTEXT — <domain / feature name>

## Overview
<1–2 paragraphs: what this domain is, and where its boundary lies.>

## Terms
**Cart** — a customer's set of selected items held before checkout.
**Order** — a cart that has been confirmed and paid for.

## Aggregates & Relationships
- **Order** owns its **line items**; one Order has 1..N line items.
- A **Customer** has 0..N Orders; an Order belongs to exactly one Customer.

## Invariants & Policies
1. An Order cannot be confirmed with zero line items.
2. A confirmed Order is immutable except for its fulfilment status.

## Out of scope
- Payment-provider integration details (handled in the payments bounded context).

## Open questions
- Can a Cart outlive a Customer session? (unresolved)
```

## Attribution

Format inspired by mattpocock's skills (`grill-with-docs`, `domain-modeling` —
https://github.com/mattpocock/skills).

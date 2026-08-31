# phased-payments-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.

The spec is byte-identical to `gap-payments-spec`'s (same clean two-phase spec, same single declared
gap: the platform egress rate-limit ceiling, owner: platform team, placement: gate before phase
2). validate-declared-gap asserts on the Deferred handling; this scenario asserts on the
VERDICT FORM:

- the verdict must be the `Phase | Ready | What holds it` table, not a single word (the
  single-word form is for unphased specs only, and this spec has two phases);
- the phase 1 row reads `yes`;
- the phase 2 row names the gate the deferred claim bounds (the platform team's ceiling
  confirmation);
- the document is never called `not ready` because of the deferred claim — a deferred claim bounds
  the phase it gates, never the document.

Every element attaches to code that is in the tree, and that is what keeps phase 1 reading `yes`.
`src/` is four modules with no entrypoint, no HTTP surface, no `/metrics` route, no environment
read and no queue consumer — `deliver` (`src/queue/worker.ts:5`) has no caller. So an element whose
mechanism needs any of those is a real finding here, not a nitpick: a queue-depth gauge, a
concurrency fan-out, a scraped metrics endpoint, an HTTP status code in an error contract, or a
prerequisite marked `met` on evidence the tree does not carry. DB-1, OBSERVABILITY-1 and CONFIG-1
are written against the retry loop and the existing store functions for exactly that reason, and
CONFIG-1's cap is process-wide module state because a per-event delay would not bound what section
8's phase-2 criterion measures.

`package.json` declares no dependencies, so section 6 names the ones the work introduces; dropping
that item puts DB-1's client and the test runner back among the unnamed.

Also load-bearing against `spec-template.md`:

- section 3 carries a **risks accepted** table after the decision table;
- section 7's rollout table carries all five columns, including `Gate after?`;
- DB-1's `Limits:` bullet promises no deletion, so section 9's "nothing is deleted" holds — any
  edit reintroducing expiry or a delete job re-plants that contradiction.

Source files are byte-identical to `defective-payments-spec`'s (see that fixture's DEFECTS.md for the
line map).

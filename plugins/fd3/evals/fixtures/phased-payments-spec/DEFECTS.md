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

The spec is `clean-payments-spec`'s plus CONFIG-1, a second phase and the declared gap, and it stays
that way deliberately: every element attaches to code that exists. The tree is a four-file skeleton
with no entrypoint, no server and no queue consumer — `deliver` (`src/queue/worker.ts:5`) has no
caller — so an element whose mechanism needs any of those (a queue-depth gauge, a concurrency
fan-out, anything "read at startup") is a real finding here, and phase 1 stops reading `yes`.
CONFIG-1 is written against the retry loop (`src/queue/worker.ts:6`) for exactly that reason.

Also load-bearing against `spec-template.md`:

- section 3 carries a **risks accepted** table after the decision table;
- section 7's rollout table carries all five columns, including `Gate after?`;
- DB-1's `Limits:` bullet promises no deletion, so section 9's "nothing is deleted" holds — any
  edit reintroducing expiry or a delete job re-plants that contradiction.

Source files are byte-identical to `defective-payments-spec`'s (see that fixture's DEFECTS.md for the
line map).

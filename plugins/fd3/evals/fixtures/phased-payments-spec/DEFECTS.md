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

Source files are byte-identical to `defective-payments-spec`'s (see that fixture's DEFECTS.md for the
line map).

# ownerless-gap-payments-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
`gap-payments-spec` with the gap's owner and placement removed. It serves validate-ownerless-gap.

## The unowned gap

The same fact is unconfirmed — the platform egress rate-limit ceiling behind D5, CONFIG-1 and the
phase-2 gate — but the spec places it nowhere and names nobody:

- section 4's sub-heading reads **`### Open question`**, not `### Declared gap`, and its paragraph
  says nobody could name who sets the ceiling or who would confirm it;
- section 7's `Gate after?` cell and hard-dependency line say phase 2 waits on *a confirmation
  nobody owns*;
- the section 12 evidence row marks it the same way.

Restore an owner or a placement in any of the three and the claim becomes `deferred` on sight, which
is the other fixture's scenario (`gap-payments-spec`), not this one.

The validate-ownerless-gap assertions require:

- the claim reaches the report — under `## Blocked`, or under `## Deferred` only with an owner and a
  placement that an answer supplied, never a stand-in like "nobody" or "TBD";
- a `## Blocked` claim lowers the verdict to `not ready`;
- the owned out-of-scope items of section 10 (refund webhooks, invoice PDF rendering, the wiring)
  never turn up as blocked — they name a team and a ticket.

With `ask_user_question: first_option` step 4's ownership question is auto-answered, so both
outcomes are within contract; what is not is a deferred entry with no owner behind it.

## Everything else

Unchanged from `gap-payments-spec` — read that fixture's DEFECTS.md for the tree's facts the spec
must keep declaring (no caller for `deliver`, `post` returns `true` unconditionally, no HTTP surface,
no manifest), the risks-accepted table, the five-column rollout table and the `Limits:` bullet that
keeps section 9 consistent. Source files are byte-identical to `defective-payments-spec`'s.

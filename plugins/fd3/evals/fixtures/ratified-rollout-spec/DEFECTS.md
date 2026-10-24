# ratified-rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
Used by build-spec-post-verdict-change. Shape taken from two real build-specs whose orchestrator
typed a post-verdict decision into the spec body itself.

## Derivation

`rollout-spec` byte for byte (its DEFECTS.md holds the spec's contract, including the 216-line
verdict line), plus `spec/rollout-spec.notes.md`: the closing notes write-spec moves beside the spec.
Regenerate from `rollout-spec` rather than editing the copy, so the two never drift apart. The spec
and its notes sit outside the two git repositories, as on re-entry.

## The change the prompt brings

The prompt passes the spec path and, beside it, the reversal the user wants: D2 to option b of
question 2. The notes record question 2's three options; option b keeps the synchronous write but
logs a failed write with the order id and lets the charge return `accepted`, with the missing entry
backfilled by hand. Its ripple is two passages: D2's row and API-1's `Errors:` bullet, which reads
`a ledger write failure fails the charge with HTTP 502 (flag on)` today. The change is not
repair-free: option b's hand backfill has no owner, and because the edit changes the line count the
first pass re-reads the whole document, where `rollout-spec`'s prerequisites (the token callers, CI
migration runs) have nothing in either tree to back them. Expect the loop to run more than one pass.

## What the check reads

- No `Edit`/`Write`/`MultiEdit` and no shell write on `spec/rollout-spec.md` from the main thread
  (a tool call without a parent tool-use id); write-spec and validate-spec run forked.
- `spec/rollout-spec.notes.md` gains a line naming D2 (or question 2) and option b.
- The API-1 sentence above is gone from the spec: option b was applied.
- One to four new dated validation headings (re-entry runs the full loop: three passes plus one
  post-verdict pass), and the last verdict line's count equals the spec's `wc -l`.
- No question ledger, no second spec, no file touched outside the spec and its notes.

# gap-payments-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.

The spec is clean EXCEPT for one deliberately declared gap: **the platform egress rate-limit
ceiling is unconfirmed** — declared in section 4 ("Declared gap"), restated as the phase-2 hard
dependency in section 7, and honestly marked in the section 12 evidence row. It names an owner
(platform team) and a placement (gate before phase 2).

The validate-declared-gap assertions require:

- the gap lands under `## Deferred` in the report, with owner and placement — never under blocking
  findings and never under "Closed during this run";
- the check it touches passes (a declared gap passes);
- with `ask_user_question: first_option`, the report shows the claim as deferred, not as settled by
  a user answer.

The fixture is authored so the first option of any AskUserQuestion round is the sane one; there
should be nothing to ask — every other claim is verifiable from the tree.

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

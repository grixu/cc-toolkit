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

Source files are byte-identical to `defective-payments-spec`'s (see that fixture's DEFECTS.md for the
line map).

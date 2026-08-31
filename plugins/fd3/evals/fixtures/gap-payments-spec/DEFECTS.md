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

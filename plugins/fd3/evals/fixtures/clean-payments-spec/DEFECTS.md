# clean-payments-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.

The spec is deliberately DEFECT-FREE: all citations resolve, the decision table is consistent,
every element carries a code, every out-of-scope item has an owner and a placement, and the
evidence table is populated with true rows. The validate-clean-spec assertions require all 12 checks to pass and
the verdict to be the single word `ready` (unphased spec — the rollout has one phase).

Load-bearing facts:

- Every `path:line` citation must keep resolving — the source files are byte-identical to
  `defective-payments-spec`'s (see that fixture's DEFECTS.md for the line map).
- The spec has exactly one rollout phase, so the verdict must be the single word, not the phase
  table.
- Section 7's rollout table carries `spec-template.md`'s five columns, including `Gate after?`;
  its single row gates because the final phase always closes its landing unit.
- Section 3 carries a **risks accepted** table after the decision table — `spec-template.md`
  requires one, and its absence is what once made this fixture stop being defect-free. Both rows accept
  their risk outright: a row that defers instead ("a later change", "a follow-up") is a deferral,
  and a deferral without an owner and a placement is a finding.
- DB-1's `Limits:` bullet promises no deletion, so section 9's "nothing is deleted" holds. Any
  edit reintroducing expiry or a delete job re-plants that contradiction.
- OBSERVABILITY-1 is a counter only. The source tree has no queue-consumer loop — `deliver`
  (`src/queue/worker.ts:5`) has no caller — so a `webhook_delivery_queue_depth` gauge would have
  no emission point and this spec creates none.
- Every element attaches to code that exists in the tree, and names its new dependencies. The tree
  has no HTTP surface, no `/metrics` route and no `process.env` read: a scraped metric, a metrics
  endpoint prerequisite or a `curl /metrics` probe has no target here, so OBSERVABILITY-1 counts
  in module scope and is read through an export the test suite calls. `post`
  (`src/queue/worker.ts:14`) returns `true` unconditionally, so the `failed` count is declared
  unexercisable rather than verified.
- Section 6 names the dependencies the work introduces, `vitest` among them: the `test` script
  invokes it and no dependency block declares it, so a spec verifying through `npm test` without
  naming it is a finding.
- A fact outside the tree is marked as asserted by its owner wherever the spec states it — D2's
  premise, the prerequisite row, the CI deploy that applies the migration, the section 5 pipeline,
  the tickets. Each carries an owner and a placement. A statement
  the repository cannot show, written as plain fact, is a finding.
- No prerequisite is marked "met" on something outside the tree. The deploy manifest and
  `DATABASE_URL` do not exist here, so that prerequisite is an assertion with an owner and a
  placement.
- The only spec edits the eval accepts are appended evidence rows under a dated sub-heading: the
  assertion checks the fixture content is a prefix of the sandbox content.

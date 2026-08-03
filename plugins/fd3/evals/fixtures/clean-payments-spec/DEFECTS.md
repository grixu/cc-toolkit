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
- The only spec edits the eval accepts are appended evidence rows under a dated sub-heading: the
  assertion checks the fixture content is a prefix of the sandbox content.

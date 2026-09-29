# stale-origin-rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it, and `SETUP.sh`, from the
sandbox copy.

Derived from `rollout-spec`: the same repos and the same spec, PLUS one line under the validation
pass's verdict line — `Checked at: repo-a @ @@SHA:repo-a@@, repo-b @ @@SHA:repo-b@@` — and the verdict
line recounted to 217 lines. Regenerate it from `rollout-spec` that way; never edit the spec here
directly.

`SETUP.sh` runs after the reset script commits the repos:

1. Each repo gets a bare origin under `.sandbox/.origins/split-stale-origin/` (outside the sandbox,
   so no diff sees it), fetched and tracked by `main`.
2. Each placeholder becomes that repo's short HEAD SHA — the commit validation "saw". The spec's
   line count does not change, so the verdict line still matches `wc -l`.
3. A teammate commit lands on repo-a's origin only, rewriting
   `repo-a/services/ledger/src/api/entries.ts` — a path the spec cites in sections 6 and 12. The
   local `main` stays at the validated commit; only a `git fetch` reveals the drift.

The split-stale-origin assertions: the split stops before writing anything (no `spec/tasks/`, no
`spec/rollout-spec.split.md`, no new file at all), leaves the spec byte-identical to what the reset
produced, leaves repo-a's local `main` at the validated commit (no rebase, no merge), and names
`entries.ts` and the `/fd3:build-spec` route in the conversation.

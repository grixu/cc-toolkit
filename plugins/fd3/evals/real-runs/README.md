# fd3 real runs

Real build-spec → split-to-tasks → implement-tasks runs on fd3 ≥ 0.4, drawn from private repositories. The data is
git-ignored under `local/` and lives in Cloudflare R2; `eval-data.json` pins the tarball this commit's evals use.

```sh
pnpm eval:data pull fd3/real-runs   # restores local/
pnpm eval:data push fd3/real-runs   # after a change; commit the new pin in eval-data.json
```

Both need the aws CLI and `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.

Each case holds what a stage can be evaluated from:

- **build-spec**: the invocation, the grill questions and answers, and an archive of the repo at the commit the run
  started from. The output is the spec as the split read it.
- **split-to-tasks**: that spec and the repo as input; the task files and the split report as the split wrote them.
- **implement-tasks**: later git snapshots of the spec folder, on-disk run files and the implement transcripts.
- **amendments**: runs that re-entered build-spec on a finished spec.

`local/README.md` lists the cases, the layout, how to rebuild the set from the session store, and its caveats.
The transcripts are verbatim, so the set belongs in the private bucket only.

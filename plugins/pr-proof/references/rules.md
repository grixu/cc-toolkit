# Rules for every walkthrough leg

These hold on top of the project's own rules, which your dispatch prompt lists.

- **Ephemeral tooling.** Run playwright-recast and Playwright through `pnpm dlx --package playwright-recast@<ver> --package @playwright/test@<ver> …`. The repository and the work dir keep no `package.json`; nothing is `pnpm add`-ed or installed, not even in scratch, whatever a dispatch prompt says.
- **One Playwright.** Only the dlx copy of `@playwright/test` loads. Mirror the repo's e2e helpers with raw `request` calls instead of importing them: they pull in the repo's own Playwright copy, and Playwright refuses to load twice.
- **Secrets stay in scripts.** Read credentials only inside the scripts that use them (`JSON.parse(fs.readFileSync(…))`) and pass them straight to the login call. Inspect a credentials file by its key names only (`jq 'keys'`); never pull a value out in the shell (`jq '.PASSWORD' … | curl`), and never write one to a log, a caption, a run-state file or an assertion message. Never run `env`/`printenv`, never print an `.env`; test one variable with `test -n` or `grep -c '^VAR='`.
- **Shared data stays untouched.** A local stack can still reach shared or external services; the project's `CLAUDE.md` says which actions do. Never create, change or delete data there unless the user named that resource under `## User decisions`; stage it in the browser instead (`page.route`, see `scenario.md`).
- **Checkouts stay clean.** Change no tracked file in any checkout. When a running dev stack's watcher rewrites generated files (OpenAPI dumps, generated client types), restore exactly those with `git checkout -- <files>` at the end, unless the branch itself changes them (`git diff --name-only origin/main...HEAD`), and report anything else `git status` shows.
- **Other stacks are off limits.** List running containers before starting anything; never stop, restart or remove one that belongs to another checkout or session.
- **Waiting.** Run long processes in the background and wait on an observable with a bounded loop (a health URL, a log line, the process's exit), never a bare foreground `sleep`. Never end your turn while a job you started is still running: ending the turn kills it. The one exception is a local stack the recording leg starts detached for retakes. Bound every Playwright run and render with `timeout <seconds>` so a hang fails instead of stalling you.
- **Deleting.** Remove work-dir files with `<this skill dir>/templates/clean.sh <work dir> <relative path>…`. Anywhere else, write every `rm` path literally and absolutely: an `rm` whose path holds a variable, a glob or `$(…)` stops the run for the user's approval even in bypassPermissions mode, and is denied when nobody answers within two minutes.
- **Web reads** go through the firecrawl MCP tools, or `WebFetch` when firecrawl is not installed; for GitHub repositories `gh` works too, and for npm release lists `npm view <package> versions --json`.
- **Your output** goes to the work dir only, probe scripts and screenshots included. The project's own env-pull and seed scripts write where they write; run them only as the recording brief allows.

## For the pr-proof skills

The sections from here on bind the pr-proof skills themselves, not a walkthrough leg: a leg reports to its orchestrator as its brief says.

Only `walkthrough-video` has `templates/clean.sh`. For every other pr-proof skill the work dir in the rules above is the manifest's directory, `~/.cache/pr-proof/<repo>/<branch>/` as computed below, and every `rm` follows the **Deleting** rule's second sentence: each path written literally and absolutely.

## The manifest

The proof reaches `pr-open` through one JSON file per branch. Both plugins compute its path the same way:

```sh
repo=$(basename -s .git "$(git remote get-url origin)")   # worktrees share it; the toplevel's name differs
branch=$(git branch --show-current | sed 's#/#%2F#g')
manifest="$HOME/.cache/pr-proof/$repo/$branch/manifest.json"
```

```jsonc
{
  "version": 1,
  "head": "<full sha at the last write>",
  "base": "main",
  "entries": [
    {
      "kind": "video | screenshots | terminal | api",
      "claim": "One sentence: what this proof shows.",
      "head": "<full sha when this entry was produced>",
      "files": ["src/a.ts"],
      "media": [{ "path": "/abs/file.png", "screen": "Checkout", "width": 375 }],
      "transcript": "/abs/terminal.txt"
    }
  ]
}
```

- `media` is absent on transcript entries; `screen` and `width` are absent on a video. `transcript` is absent on media entries. Every path is absolute.
- `head` per entry is required: re-runs keep older entries, and `pr-open` judges each entry's staleness by its own `head`.
- `base` is reported, not compared. The writer that creates the manifest sets it: under `prepare-proof`, the `base` it passes with the URLs and `files`; run by hand, the repository's default branch (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`). Later writers keep it. Top-level `head` records the last write; nothing compares it.
- Only a produced proof enters the manifest; a failure goes to the skill's report. An empty `entries` list means "no proof needed", distinct from an absent manifest, which means "not run". `pr-open` ignores an unknown `version` and says so in its report.

**Writing.** Load, drop the entries of the same kind, append yours, set the top-level `head` to HEAD; entries of other kinds stay. Write your entry to `<work dir>/entry.json` first (without `head`; the recipe adds it), then:

```sh
mkdir -p "$(dirname "$manifest")"
head=$(git rev-parse HEAD)
[ -f "$manifest" ] || jq -n --arg base "$base" '{version: 1, head: "", base: $base, entries: []}' > "$manifest"
jq --slurpfile e "<work dir>/entry.json" --arg head "$head" \
  '.head = $head | .entries = ([.entries[] | select(.kind != $e[0].kind)] + [$e[0] + {head: $head}])' \
  "$manifest" > "$manifest.tmp" && mv "$manifest.tmp" "$manifest"
```

"No proof needed" writes the same file with `entries: []`: `jq -n --arg base "$base" --arg head "$(git rev-parse HEAD)" '{version: 1, head: $head, base: $base, entries: []}' > "$manifest"`.

## Approval

The user watches every video and looks at every screenshot before it counts as proof. A video or screenshot the user rejects does not enter the manifest; ask whether to retake it. Under an agent caller the approval goes through the caller, as below.

## Run by another agent

When an agent dispatched you, you cannot reach the user directly; every gate stays, only who answers changes. At a confirmation or approval, end your turn with a `Confirmation needed` block for the caller: the work dir, then one line per item to confirm, in the user's language, each decision with its options and your recommendation. The caller folds the blocks into one question to the user and resumes you with the answers. Never treat "don't ask the user" in a dispatch as leave to skip a gate; hand the block to the caller instead.

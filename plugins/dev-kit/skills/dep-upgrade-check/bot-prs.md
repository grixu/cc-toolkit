# Reading a dependency-bot pull request

Two sources, with different trust:

- **The diff is authoritative** for what changes. `gh pr diff <url> --name-only` lists the touched manifests and lockfiles; `gh pr diff <url>` shows each version hunk. Take every unit's `current → target` from the manifest and lockfile hunks.
- **The body is an index**, useful for the release-notes links it embeds, but incomplete: both bots truncate long notes, and a bot PR that skips several versions often shows only the newest few. Step 2 of the skill still fetches the full notes for every version in the range.

`gh pr view <url> --json title,author,headRefName,baseRefName,body,files` gives the rest. The analysis runs against the base branch's code, so when the local checkout sits on another branch, say which ref the usage surface was read from.

## Renovate

Author `renovate` (or `app/renovate`), branch `renovate/<topic>`. The body opens with a table, `| Package | Change | ... |`, one row per package, the Change cell reading `` `4.1.0` → `5.0.2` ``. Under `### Release Notes` sits one `<details>` block per package, summary `owner/repo (package)`, holding a `### [vX.Y.Z](compare link)` heading per version.

- **Grouped PR** ("Update all non-major dependencies", or a `groupName` such as a monorepo group): one table row per package, so one unit per row. Rows that share a source repository and the same bump, such as many `@aws-sdk/client-*` packages, share one ledger.
- **Lockfile-only update** (the range in the manifest is untouched, the lockfile resolves a newer version): the diff shows only lockfile hunks. The unit is still `resolved → new resolved`; it runs the full check.
- **Lock file maintenance** (title "Lock file maintenance", Change column "All locks refreshed"): no table of versions. Derive the units from the lockfile diff, keep the direct dependencies and any transitive package that crosses a major, and list the rest by count in the report.

## Dependabot

Author `dependabot` (or `app/dependabot`), branch `dependabot/<ecosystem>/<package>-<version>`. Title `Bump <package> from <current> to <target>`, or `Bump the <group> group with N updates` for a grouped PR, whose body lists each package with its from and to versions. Each package carries `<details>` blocks with the summaries `Release notes`, `Changelog`, and `Commits`; `... (truncated)` marks a cut.

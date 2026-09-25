---
name: dep-upgrade-check
description: Dependency upgrade compatibility check. Finds everything that changes between the version a codebase resolves today and a target version, maps each change to where the code uses it, and returns a safe / safe with changes / breaking verdict with file:line evidence. Use when the user names a package and a target version, links a Renovate or Dependabot pull request, or asks whether bumping a dependency will break the build.
argument-hint: "<package>[@<version>] | <pull request URL>"
allowed-tools: Read Grep Glob Bash(gh repo view *) Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr checks *) Bash(gh release list *) Bash(gh release view *) Bash(pnpm view *) Bash(pnpm why *) Bash(pnpm list *) Bash(npm diff *) mcp__firecrawl__firecrawl_search mcp__firecrawl__firecrawl_scrape mcp__context7__resolve-library-id mcp__context7__query-docs
---

# dep-upgrade-check

Answer one question with evidence: does moving this dependency from the version the codebase resolves today to the target version break anything this codebase actually uses? The work is read-only analysis. It changes no manifest, lockfile, or source file; applying the upgrade happens only when the user asks for it after the report.

Two artifacts carry the analysis: the **usage surface** (every way the codebase touches the package) and the **change ledger** (every change in the range current → target). The verdict is their intersection.

Input: `$ARGUMENTS`. With nothing given, ask for a package and target version or a PR link.

The commands below are pnpm/npm defaults. For a Python, Go, PHP, or Rust dependency, or a JS repo on npm or yarn, read [`ecosystems.md`](ecosystems.md) for the equivalents; every step stays the same.

## 1. Pin the range

Resolve every upgrade unit to `package: current → target`, where both ends are exact versions.

- **PR link**: read [`bot-prs.md`](bot-prs.md) to extract the units from a Renovate or Dependabot PR, including grouped and lockfile-only PRs. Confirm the PR belongs to the repository in the working directory (`gh repo view --json nameWithOwner`); when it does not, ask for the path of a local checkout.
- **Package + version**: take the target as given; with no version, use the `latest` dist-tag (`pnpm view <pkg> dist-tags --json`).
- **Current version** is the version the lockfile resolves, not the manifest range: `pnpm why -r <pkg> --json` lists each resolved version and the workspace projects that pull it in. A `^4.1.0` range can resolve to `4.9.2`, and the range starts there.
- **Multiple resolutions** (monorepo projects on different versions, or a direct and a transitive copy): keep one unit per resolved version and record which projects each covers. The report splits by unit.
- **Transitive-only package** (no manifest declares it): name the direct dependents that pull it in and check whether their declared ranges even admit the target (`pnpm view <parent>@<ver> dependencies --json`). A target outside every parent's range reaches the codebase only through an `overrides` entry, and the report says so.

Done when every unit has an exact current version, an exact target version, and the list of projects it affects.

## 2. Build the change ledger

For each unit, list every published version in `(current, target]`: `pnpm view <pkg> versions --json` returns publish order, not semver order, so filter and sort by semver. Skip pre-releases unless the target is one.

Find the source repository with `pnpm view <pkg>@<target> repository --json` (a monorepo package also names a `directory`). Then gather from these sources; each version needs at least one of the first two, and every major boundary needs the third:

1. **GitHub Releases**: `gh release list -R <owner>/<repo> -L 100 --json tagName,publishedAt,isPrerelease`, then `gh release view <tag> -R <owner>/<repo> --json body`. Tags vary: `v1.2.3`, `1.2.3`, or `<pkg>@1.2.3` in changesets monorepos.
2. **Changelog file** at the target tag: `gh api -H "Accept: application/vnd.github.raw+json" "repos/<owner>/<repo>/contents/<path>?ref=<tag>"`, where the path is `CHANGELOG.md`, `HISTORY.md`, or the package directory's changelog.
3. **Documentation**: the migration or upgrade guide for every major boundary crossed, found with firecrawl or context7. Release notes for a major often only link to this guide, and the guide holds the breaking list.
4. **Fallback when a version has neither releases nor changelog**: the registry diff, `npm diff --diff=<pkg>@<current> --diff=<pkg>@<target> '*.d.ts' package.json` (read-only, no pnpm equivalent), plus the commit range `gh api "repos/<owner>/<repo>/compare/<currentTag>...<targetTag>" --jq '.commits[].commit.message'` scanned for `BREAKING`, `!:`, `remove`, `drop`, `rename`, `deprecate`.

Independently of the notes, diff the package metadata between both ends, since this is where silent breaks hide: `pnpm view <pkg>@<v> engines peerDependencies exports type main types bin --json` for `v` = current and target. A dropped subpath in `exports`, a switch to `"type": "module"`, a raised `engines.node`, or a new required peer breaks consumers without any API change. The reverse direction counts too: every installed package that declares this one as a peer (a plugin, an adapter) must admit the target in its `peerDependencies`, or it needs its own upgrade, which the report names.

Record each entry as `version | kind | change | source URL`, where kind is one of: breaking, removal, deprecation, changed default, behavior change, new peer or engine requirement, type change, codemod available. Crossing several majors, walk each major boundary in order and keep its migration guide's items under that major; a later major can re-break what an earlier one deprecated. For a `0.x` package treat every minor bump as a major. For a pre-release target, notes are often missing: fall back to the compare range and the registry diff, and flag in the report that the API can still move before the stable release.

**Several units** (a grouped PR, or the user names several packages): units that share a source repository and version bump share one ledger. Give majors and minors the full ledger; a patch unit gets a scan of its notes for the kinds above. With three or more units needing a full ledger, dispatch one subagent per unit in a single message, without a `name`, each carrying its `package: current → target`, the projects it covers, and steps 2–3 of this skill; each returns its ledger rows already marked against the usage surface.

Done when every version in the range has a ledger entry or an explicit `no relevant changes`, every major boundary has its migration guide read or marked `no guide found`, and the metadata diff is recorded.

## 3. Map the usage surface

Enumerate every way the codebase touches the package, in every project the unit covers:

- imports and requires, including subpath imports (`pkg/utils`), dynamic `import()`, type-only imports, and re-exports;
- each named API called, class extended, option object passed, and type referenced;
- config files that load it or configure it (plugins, presets, `*.config.*`);
- CLI invocations in `package.json` scripts, CI workflows, Dockerfiles, and git hooks, with their flags;
- side-effect imports and global registrations, and environment variables the package reads;
- the runtime the project runs on (`.nvmrc`, `.node-version`, `engines`, the CI setup step, the Dockerfile base image) and the installed versions of the target's peers, for the engine and peer entries.

When the repository is indexed in a code graph (for example the codebase-memory MCP), query it for imports and callers first; otherwise use text search over the source. Record each site as `file:line`.

Then intersect: for each ledger entry, check whether any usage-surface site touches it. An entry is **affected** (a site uses the changed thing), **not affected** (the change is outside the surface), or **unknown** (runtime behavior or a changed default that static reading cannot settle).

Done when every ledger entry carries one of the three marks, and every affected or unknown entry cites the `file:line` sites behind it.

## 4. Gather cheap empirical evidence

For a PR input, read its CI result: `gh pr checks <url> --json name,bucket,link`. A failing check on a bot PR is direct evidence; read its log before concluding.

A local build against the target is offered, not run by default: it downloads packages and runs their install scripts. Offer it when the verdict is not `safe` or when unknowns remain. On consent, run it in a throwaway worktree so the user's working tree and lockfile stay untouched:

1. `git worktree add --detach <tmpdir> <ref>`, where the ref is the PR head for a PR (`git fetch origin pull/<number>/head`, then `FETCH_HEAD`; its lockfile already carries the upgrade) or the current `HEAD` otherwise.
2. In the worktree, install the way the repository's CI does, and for a non-PR input add the target (`pnpm add <pkg>@<target> --filter <project>`).
3. Run the repository's typecheck, test, and build commands as its `package.json` scripts or CI workflow define them.
4. `git worktree remove --force <tmpdir>`.

Fold the results back into the ledger: a failure tied to an entry turns it affected; a pass does not clear a runtime-behavior unknown that no test exercises.

## 5. Report

Lead with the verdict and one sentence of reasoning:

- **safe**: no ledger entry touches the usage surface, and no unknown is load-bearing.
- **safe with changes**: affected entries exist, each with a known, bounded fix (a rename, a config key, a codemod, a peer bump).
- **breaking**: an affected entry has no drop-in fix, the runtime or engine floor is above what the project runs, or the fix spans a redesign.

Then:

| Change (version) | Where used | Impact | Required fix |
|---|---|---|---|
| `foo()` removed (5.0.0) | `src/api/client.ts:42` | build fails | use `bar()`; run the v5 codemod |

- **Not affected**: one line per ledger entry, or a count per kind when there are many.
- **Unknowns**: what could not be settled and what would settle it.
- **Sources**: the release, changelog, and guide URLs the ledger used.
- **Evidence run**: CI and worktree results, or the offer to run them.

Split the table by unit when a PR or monorepo carries several. When the user asks to apply the upgrade, apply the fixes from the table, then run the step-4 checks in the working tree.

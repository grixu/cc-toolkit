---
name: dep-upgrade-check
description: Dependency upgrade compatibility and security check. Gates the target version on known vulnerabilities, malware, and release age, finds everything that changes between the version a codebase resolves today and the target, maps each change to where the code uses it, and returns a safe / safe with changes / breaking verdict with file:line evidence. Use when the user names a package and a target version, links a Renovate or Dependabot pull request, or asks whether bumping a dependency will break the build.
argument-hint: "<package>[@<version>] | <pull request URL> [unattended]"
allowed-tools: Read Grep Glob Write Bash(printenv GITHUB_ACTIONS) Bash(git fetch *) Bash(git show *) Bash(gh repo view *) Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr checks *) Bash(gh run view *) Bash(gh api *) Bash(gh release list *) Bash(gh release view *) Bash(pnpm view *) Bash(pnpm why *) Bash(pnpm list *) Bash(npm diff *) Bash(curl -s https://api.osv.dev/*) Bash(curl -s https://api.deps.dev/*) WebFetch mcp__firecrawl__firecrawl_search mcp__firecrawl__firecrawl_scrape mcp__context7__resolve-library-id mcp__context7__query-docs
---

# dep-upgrade-check

Answer one question with evidence: does moving this dependency from the version the codebase resolves today to the target version break anything this codebase actually uses, and is the target safe to take at all? The work is read-only analysis. It changes no manifest, lockfile, or source file; applying the upgrade happens only when the user asks for it after the report. The one write it makes unasked is the security comment on a PR input.

Two artifacts carry the analysis: the **usage surface** (every way the codebase touches the package) and the **change ledger** (every change in the range current → target). The verdict is their intersection.

Input: `$ARGUMENTS`. With nothing given, ask for a package and target version or a PR link.

## Invocation contract

- **Unattended** when the arguments carry the literal token `unattended`, or when `printenv GITHUB_ACTIONS` prints `true`. Say in the first status line which of the two switched it on. A CI job runs the skill this way; nobody is there to answer.
- Unattended, nothing waits for a person, and nothing that downloads or runs third-party code is offered or run:
  - Wherever this skill says to ask, the run ends with status `stopped` and the reason instead: no input, a PR from another repository, any other ambiguity the input leaves open.
  - An escalated unit gets no question. Its security comment goes out at once, with the Decision `pending` (`security.md` has the line), or with the decision a maintainer recorded earlier when it still applies.
  - Step 5 reads the CI checks once and never waits for them. A check still running is reported as `pending at <ISO time>`, not as evidence.
  - A provisional verdict names each unknown and what would settle it, without an offer.
  - The upgrade is never applied.
- Every run ends with the **result block** (last section), an early stop too.

The commands below are pnpm/npm defaults. For a Python, Go, PHP, or Rust dependency, a container image, a GitHub Action, or a JS repo on npm or yarn, read [`ecosystems.md`](ecosystems.md) for the equivalents; every step stays the same.

## 1. Pin the range

Resolve every upgrade unit to `package: current → target`, where both ends are exact versions.

- **PR link**: read [`bot-prs.md`](bot-prs.md) to extract the units from a Renovate or Dependabot PR, including grouped and lockfile-only PRs. Confirm the PR belongs to the repository in the working directory (`gh repo view --json nameWithOwner`); when it does not, ask for the path of a local checkout.
- **Package + version**: take the target as given; with no version, use the `latest` dist-tag (`pnpm view <pkg> dist-tags --json`).
- **Current version** is the version the lockfile resolves, not the manifest range: `pnpm why -r <pkg> --json` lists each resolved version and the workspace projects that pull it in. A `^4.1.0` range can resolve to `4.9.2`, and the range starts there.
- **Current version of a PR input** comes from the base branch's lockfile, never the working tree: `git fetch origin <baseRefName>`, then `git show origin/<baseRefName>:<lockfile>`. A checkout of the PR branch, or of its merge commit (what `actions/checkout` gives a `pull_request` run), already resolves the target, and the range would come out empty. `pnpm why -r` still names the projects that pull the package in. When the working-tree lockfile already resolves the PR head's version, say so in the report: `usage surface read from <ref>; its lockfile already carries the upgrade`.
- **Multiple resolutions** (monorepo projects on different versions, or a direct and a transitive copy): keep one unit per resolved version and record which projects each covers. The report splits by unit.
- **Transitive-only package** (no manifest declares it): name the direct dependents that pull it in and check whether their declared ranges even admit the target (`pnpm view <parent>@<ver> dependencies --json`). A target outside every parent's range reaches the codebase only through an `overrides` entry, and the report says so.

Done when every unit has an exact current version, an exact target version, and the list of projects it affects.

## 2. Check the security record

Read [`security.md`](security.md) and run its lookups for every unit's current and target versions and for the transitive versions the upgrade brings in, merging OSV.dev and the GitHub Advisory Database into one advisory list. Severity counts from moderate up. Give each unit an outcome:

- **blocked**: malware on the target or a transitive version it brings in, the target or such a version gone from the registry, or a version published less than 7 days ago that fixes no moderate-or-above advisory of the version it replaces. A blocked unit skips steps 3–5; the report names the minimum safe version instead.
- **escalated**: the target, or a transitive version it brings in, carries a moderate-or-above advisory. Steps 3–5 run in full, and step 4 maps each such advisory onto the usage surface.
- **clear**: neither.

Whether the codebase reaches the vulnerable code never lowers an outcome; it goes to the user as input for their decision.

Done when every unit has an outcome, every moderate-or-above advisory carries its status against current (`fixed by upgrade`, `introduced`, `still present`), and every package left out is listed as `not checked` with the reason.

## 3. Build the change ledger

For each unit, list every published version in `(current, target]`: `pnpm view <pkg> versions --json` returns publish order, not semver order, so filter and sort by semver. Skip pre-releases unless the target is one.

Find the source repository with `pnpm view <pkg>@<target> repository --json` (a monorepo package also names a `directory`). Then gather from these sources; each version needs at least one of the first two, and every major boundary needs the third:

1. **GitHub Releases**: `gh release list -R <owner>/<repo> -L 100 --json tagName,publishedAt,isPrerelease`, then `gh release view <tag> -R <owner>/<repo> --json body`. Tags vary: `v1.2.3`, `1.2.3`, or `<pkg>@1.2.3` in changesets monorepos.
2. **Changelog file** at the target tag: `gh api -H "Accept: application/vnd.github.raw+json" "repos/<owner>/<repo>/contents/<path>?ref=<tag>"`, where the path is `CHANGELOG.md`, `HISTORY.md`, or the package directory's changelog.
3. **Documentation**: the migration or upgrade guide for every major boundary crossed. Release notes for a major often only link to this guide, and the guide holds the breaking list. Look in this order and stop at the first guide found:
   1. a guide file in the source repository at the target tag: list the paths with `gh api "repos/<owner>/<repo>/git/trees/<tag>?recursive=1" --jq '.tree[].path'`, look for `UPGRADING.md`, `MIGRATION.md`, or `migrat*` under `docs/`, and read it as in source 2;
   2. context7, or a `firecrawl_search` for the guide, read with `firecrawl_scrape`;
   3. without firecrawl, `WebFetch` of the guide URL that the release notes or the package's `homepage` link to.

   With none found, the ledger entry reads `no guide found`, or `no guide found (docs tools unavailable)` when neither firecrawl nor context7 is connected, and the report lists it under **Unknowns**.
4. **Fallback when a version has neither releases nor changelog**: the registry diff, `npm diff --diff=<pkg>@<current> --diff=<pkg>@<target> '*.d.ts' package.json` (read-only, no pnpm equivalent), plus the commit range `gh api "repos/<owner>/<repo>/compare/<currentTag>...<targetTag>" --jq '.commits[].commit.message'` scanned for `BREAKING`, `!:`, `remove`, `drop`, `rename`, `deprecate`.

Independently of the notes, diff the package metadata between both ends, since this is where silent breaks hide: `pnpm view <pkg>@<v> engines peerDependencies exports type main types bin --json` for `v` = current and target. A dropped subpath in `exports`, a switch to `"type": "module"`, a raised `engines.node`, or a new required peer breaks consumers without any API change. The reverse direction counts too: every installed package that declares this one as a peer (a plugin, an adapter) must admit the target in its `peerDependencies`, or it needs its own upgrade, which the report names. For a PR input, also resolve the package on the PR head's lockfile (`git fetch origin pull/<number>/head`, then `git show FETCH_HEAD:pnpm-lock.yaml`, or `pnpm why -r <pkg>` in the step-5 worktree): when old and new copies coexist and the package's classes or nominal types cross package boundaries (`instanceof`, TypeScript private members), record a `split resolution` entry whose fix is a targeted `pnpm update -r <pkg>` or a dedupe.

Record each entry as `version | kind | change | source URL`, where kind is one of: breaking, removal, deprecation, changed default, behavior change, new peer or engine requirement, type change, split resolution, codemod available. Crossing several majors, walk each major boundary in order and keep its migration guide's items under that major; a later major can re-break what an earlier one deprecated. For a `0.x` package treat every minor bump as a major. For a pre-release target, notes are often missing: fall back to the compare range and the registry diff, and flag in the report that the API can still move before the stable release.

**Several units** (a grouped PR, or the user names several packages): units that share a source repository and version bump share one ledger. Give majors and minors the full ledger; a patch unit gets a scan of its notes for the kinds above. With three or more units needing a full ledger, dispatch one subagent per unit in a single message, without a `name`, each carrying its `package: current → target`, the projects it covers, its moderate-or-above advisories when escalated, and steps 3–4 of this skill; each returns its ledger rows already marked against the usage surface.

Done when every version in the range has a ledger entry or an explicit `no relevant changes`, every major boundary has its migration guide read or marked `no guide found`, and the metadata diff is recorded.

## 4. Map the usage surface

Enumerate every way the codebase touches the package, in every project the unit covers:

- imports and requires, including subpath imports (`pkg/utils`), dynamic `import()`, type-only imports, and re-exports;
- each named API called, class extended, option object passed, and type referenced;
- config files that load it or configure it (plugins, presets, `*.config.*`);
- CLI invocations in `package.json` scripts, CI workflows, Dockerfiles, and git hooks, with their flags;
- side-effect imports and global registrations, and environment variables the package reads;
- the runtime the project runs on (`.nvmrc`, `.node-version`, `engines`, the CI setup step, the Dockerfile base image) and the installed versions of the target's peers, for the engine and peer entries.

When the repository is indexed in a code graph (for example the codebase-memory MCP), query it for imports and callers first; otherwise use text search over the source. A zero-hit graph query is not absence: confirm "not used" with one text search before marking an entry not affected. Record each site as `file:line`.

Then intersect: for each ledger entry, check whether any usage-surface site touches it. An entry is **affected** (a site uses the changed thing), **not affected** (the change is outside the surface), or **unknown** (runtime behavior or a changed default that static reading cannot settle).

For an escalated unit, map each moderate-or-above advisory the same way, from the GHSA `vulnerable_functions`, the OSV `affected[].ecosystem_specific` imports and symbols, or the API its summary names: `used at file:line`, `not found`, or `unknown`.

Done when every ledger entry carries one of the three marks, every affected or unknown entry cites the `file:line` sites behind it, and every escalated advisory carries its mark.

## 5. Gather cheap empirical evidence

For a PR input, read its CI result: `gh pr checks <url> --json name,bucket,link`. A failing check on a bot PR is direct evidence; read its log (`gh run view <run-id> --log-failed`) before concluding. When `--log-failed` is empty or answers 403/404, read `gh api repos/OWNER/REPO/actions/jobs/<job-id>/logs`, then the step conclusions (`gh api repos/OWNER/REPO/actions/jobs/<job-id> --jq '.steps[]|{name,conclusion}'`) and `gh api repos/OWNER/REPO/check-runs/<job-id>/annotations`, before concluding anything. A failure in a setup or post step after the test/build step succeeded is runner infrastructure, not evidence for or against the upgrade; say so and suggest `gh run rerun <id> --failed`.

Anything that downloads and executes third-party code (package installs, `docker pull` or `docker run`, release binaries) is offered, not run by default. That includes a local build against the target: it downloads packages and runs their install scripts. Offer it when the verdict is not `safe` or when unknowns remain. On consent, run it in a throwaway worktree so the user's working tree and lockfile stay untouched:

1. `git worktree add --detach <tmpdir> <ref>`, where the ref is the PR head for a PR (`git fetch origin pull/<number>/head`, then `FETCH_HEAD`; its lockfile already carries the upgrade) or the current `HEAD` otherwise.
2. In the worktree, install the way the repository's CI does, and for a non-PR input add the target (`pnpm add <pkg>@<target> --filter <project>`).
3. Run the repository's typecheck, test, and build commands as its `package.json` scripts or CI workflow define them.
4. `git worktree remove --force <tmpdir>`.

Fold the results back into the ledger: a failure tied to an entry turns it affected; a pass does not clear a runtime-behavior unknown that no test exercises.

## 6. Report

Lead with the security outcome (`clear`, `escalated`, or `blocked` with its reason), then the compatibility verdict and one sentence of reasoning. A blocked unit has no compatibility verdict.

- **safe**: no ledger entry touches the usage surface, and no unknown is load-bearing.
- **safe with changes**: affected entries exist, each with a known, bounded fix (a rename, a config key, a codemod, a peer bump).
- **breaking**: an affected entry has no drop-in fix, the runtime or engine floor is above what the project runs, or the fix spans a redesign.

While a load-bearing unknown remains, give the worst verdict it could resolve to, mark it `provisional`, name the unknown, and make the step-5 offer in the same message; unattended, say what would settle it instead.

Then:

- **Security**: the advisory table from `security.md`, the malware, registry, cooldown and provenance lines, the transitive findings, the low-severity count, and the `not checked` list. For a blocked or escalated unit, the minimum safe version or the lockfile refresh.

| Change (version) | Where used | Impact | Required fix |
|---|---|---|---|
| `foo()` removed (5.0.0) | `src/api/client.ts:42` | build fails | use `bar()`; run the v5 codemod |

- **Not affected**: one line per ledger entry, or a count per kind when there are many.
- **Unknowns**: what could not be settled and what would settle it.
- **Sources**: the release, changelog, and guide URLs the ledger used.
- **Evidence run**: CI and worktree results, or the offer to run them.

Split the table by unit when a PR or monorepo carries several.

An escalated unit ends the report with a question to the user: accept the risk, switch the target to the minimum safe version (steps 2–5 then run for it) or, when `security.md` calls for a lockfile refresh, refresh those transitive packages, or hold. Record the answer and any reason given. Unattended, there is no question: the Decision stays pending or carries over, as `security.md` describes.

For a PR input, post the security comment `security.md` describes once every outcome is final: right away when all units are clear or blocked, after the user's answer when one is escalated, and right away for every outcome when unattended. A re-run updates the same comment.

An unattended run on a PR input also posts the rest of the report, since nobody reads its output: a second comment, written in English to a file, starting with the marker line `<!-- dev-kit:dep-upgrade-check:report -->`, then the security outcome line, the verdict with its sentence of reasoning, the affected-changes table, the not-affected count, the unknowns, the sources, and the evidence run. It goes up with the security comment's upsert procedure from `security.md`, under its own marker, and a re-run updates it.

When the user asks to apply the upgrade:

- **Package + version input**: apply the fixes from the table in the working tree, then run the step-5 checks there.
- **PR input**: apply them on the PR's head branch in a worktree outside the user's checkout (the session scratchpad when there is one; `git fetch origin <headRefName>`, then `git worktree add <dir> <headRefName>`). Commit there, staging by explicit file path, run the step-5 checks there, and push only on the user's explicit go-ahead. Say that Renovate and Dependabot rebase their branches and drop commits that are not theirs, and name the bot setting that removes the need for the commit when one exists (for example Renovate `postUpdateOptions: ["pnpmDedupe"]`).

## Result block

End every run, an early stop too, with this block, exactly these keys, each on one line. A CI job parses it.

````
```dep-upgrade-check-result
status: done | stopped
security: clear | escalated | blocked | n/a
verdict: safe | safe with changes | breaking | not assessed | n/a
provisional: true | false
decision: accepted | switched | refresh | hold | pending | n/a
decision_carried: true | false
units: <count>
security_comment: <URL> | none
report_comment: <URL> | none
reason: <one line: why stopped, blocked or provisional> | none
```
````

`decision` is always the decision itself, also when it was carried from an earlier comment, and `n/a` when no unit is escalated. `decision_carried` is `true` when the Decision came from an earlier comment (`security.md`, "Carried decision"), otherwise `false`, so always `false` with `pending` or `n/a`. A CI gate passes on `status: done`, `security` `clear` or `escalated`, and `decision` `accepted` or `n/a`, carried or not; `decision_carried` is there for whoever reads the log.

With several units, `security` and `verdict` take the worst unit's value, and `decision` the first value any escalated unit holds in the order `pending`, `hold`, `switched`, `refresh`, `accepted`, a carried decision counting like a fresh one: one carried `hold` makes the run `hold`. `verdict` is `n/a` when every unit is blocked.

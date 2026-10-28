# Security record lookups

The lookups, rules, and PR comment behind step 2 of the skill. Ecosystem names and release-time sources for non-npm units are in [`ecosystems.md`](ecosystems.md).

## Which versions to check

- **Every unit**: its current and its target version.
- **Transitive versions the upgrade brings in**:
  - **PR input**: every package whose resolved version is new or changed between the base branch's lockfile and the PR head's (`git fetch origin pull/<number>/head`, then `git show FETCH_HEAD:<lockfile>` against `git show origin/<baseRefName>:<lockfile>`). A changed one is checked against its base version; a new one has no base version.
  - **Package + version input**: `curl -s https://api.deps.dev/v3/systems/<npm|pypi>/packages/<urlencoded name>/versions/<v>:dependencies` for current and target, then check the nodes of the target that the current graph lacks. deps.dev resolves the graph in isolation, not against the project's lockfile, so the report calls this set approximate. Other ecosystems get `transitive not checked`, and the step-5 worktree install settles it from the lockfile it writes.
- **Private packages are never sent anywhere**: a package resolved from a host other than the public registry is listed as `not checked: private registry`, and its name goes to no OSV, GitHub, or deps.dev query. Signs: a `tarball`/`resolved` URL on another host in the lockfile, a scoped `@scope:registry=` in `.npmrc`, an `index-url`/`[[tool.uv.index]]`/poetry `source` other than PyPI, a module matched by `GOPRIVATE`, a Composer `repositories` entry, a non-crates.io `source` in `Cargo.lock`.

## Lookups

1. **OSV**, every ecosystem except GitHub Actions. One batch for all versions above. Write the payload to a file and post it with `curl -s https://api.osv.dev/v1/querybatch -d @<file>`. Keep each `curl` in this file in the form shown, the URL unquoted right after `-s` and no other command chained to it: that form is what the skill pre-approves, and an unattended run is denied any other. The payload looks like `{"queries":[{"package":{"name":"<pkg>","ecosystem":"<OSV ecosystem>"},"version":"<v>"}, ...]}`. The batch returns IDs only, so fetch each distinct ID with `curl -s https://api.osv.dev/v1/vulns/<id>`. A result with `next_page_token` needs a follow-up query carrying that token.
2. **GitHub Advisory Database**, for EPSS, `first_patched_version`, and `vulnerable_functions`, and the only source for GitHub Actions (OSV version queries for Actions return nothing). Make two calls per version:
   - `gh api -X GET /advisories -f ecosystem=<e> -f affects=<pkg>@<v> --paginate`;
   - the same with `-f type=malware`. The endpoint leaves malware out unless asked.

Merge both sources into one record per advisory, deduplicated through `aliases`, which link a `GHSA-*`, `CVE-*`, `MAL-*`, `PYSEC-*`, `RUSTSEC-*` or `GO-*` ID to the others. Drop an advisory with `withdrawn` set or a summary starting `Duplicate Advisory`.

## Rules

- **Severity** is the GHSA `severity`, else OSV `database_specific.severity`. An advisory with neither (most `GO-*` and `RUSTSEC-*` records) counts as **moderate**. An `unreviewed` GHSA counts at its stated severity and carries the label `unreviewed`.
  - Advisories at moderate or above drive the outcome.
  - Low ones appear in the report and the comment as a count only.
- **Malware** is any `MAL-*` ID or a GHSA of type `malware`, at any severity.
  - Malware on **current** means the installed version is already compromised. The report and the comment give it its own malware line whatever the unit's outcome, besides its `fixed by upgrade` row.
- **Status of each advisory**, comparing current with target: `fixed by upgrade` (affects current, not target), `introduced` (affects target, not current), or `still present` (affects both). For a new transitive package every advisory is `introduced`.
- **Missing from the registry**: the registry no longer knows the target, or a transitive version from the PR lockfile. `pnpm view <pkg>@<v> version` answers E404, and deps.dev answers `Version not found`. Registries take down malicious versions this way, often before an advisory exists, while a bot PR opened earlier still points at them. Check that the package is not private before reading the 404 this way.
- **Release age**: the publish time of the target and of each changed or new transitive version is in `pnpm view <pkg> time --json` (key = version); other ecosystems are in `ecosystems.md`. A version under **7 days** old is in cooldown until publish time + 7 days.
  - **Exemption**: the version fixes an advisory at moderate or above that affects the version it replaces (current for the target, the base-lockfile version for a changed transitive package). A new transitive package replaces nothing and gets no exemption.
- **Provenance regression**: current has a verified SLSA attestation on deps.dev (`slsaProvenances[].verified`, from the `versions/<v>` endpoint) and the target has none. This is reported, not an outcome by itself. A present attestation proves nothing about malware: compromised release pipelines publish validly signed versions.

## Outcome per unit

- **blocked**: malware on the target or on a transitive version it brings in, the target or such a version missing from the registry, or a cooldown without exemption. Name the reason, and for a cooldown the date the version becomes acceptable.
- **escalated**: not blocked, and an advisory at moderate or above is `introduced` or `still present` on the target or on a transitive version it brings in.
- **clear**: neither.

Whether the codebase reaches the vulnerable code never changes the outcome. It is information for the user's decision.

With several units (a grouped PR, a monorepo), the overall outcome is the worst one: blocked over escalated over clear. Every escalated unit gets its own question, all asked in one round.

**Minimum safe version**, for a blocked or escalated unit: the lowest version above current with no advisory at moderate or above and no malware, that is out of cooldown or exempt from it. Check candidates in ascending semver order with the same lookups. Say when none exists up to `latest`. It is never the target itself.

**Lockfile refresh** replaces the minimum safe version when the unit is escalated only by transitive versions pinned in the PR lockfile, and the range their parent declares already admits a fixed version. A deps.dev check of the target resolves that range fresh and would return the target itself. Name each transitive package and the fixed version its range admits.

## PR comment

A PR input always gets one security comment, also when every unit is `clear`, and a re-run updates it instead of adding another. Write it in English, to a file, starting with the marker line:

```markdown
<!-- dev-kit:dep-upgrade-check:security -->
### Dependency security check: <clear | escalated | blocked>

<one line per unit: `pkg current → target`: outcome and reason; for blocked/escalated the minimum safe version or the lockfile refresh>

| Advisory | Severity | Summary | Affected → fixed | vs current | Codebase use |
|---|---|---|---|---|---|
| [GHSA-xxxx](https://github.com/advisories/GHSA-xxxx) (CVE-…) | high · EPSS 86th pct | … | `<1.15.0` → 1.15.0 | still present | `src/http.ts:12` / not found / unknown |

- **Malware / registry / cooldown / provenance**: one line each that applies.
- **Transitive**: advisories and cooldowns on versions the upgrade brings in, or `none`; `approximate` for a deps.dev graph.
- **Low severity**: <count>, or `none`.
- **Not checked**: private packages, ecosystems without a transitive source.
- **Decision** (escalated only): <accepted risk | switched target to X | refresh <pkg> to Y in the lockfile | hold>, by @<login>, <date>, <reason if given>. Unattended: `pending — unattended run; a maintainer decides (accept, switch to <minimum safe version>, refresh <pkg> to <version>, or hold)`.

Sources: OSV.dev, GitHub Advisory Database, deps.dev; queried <ISO timestamp>.
```

Upsert:
1. List the PR's marker comments with GraphQL, which tells which ones this token wrote whatever kind of token it is (`GET /user` fails for `GITHUB_TOKEN` and GitHub App tokens):
   `gh api graphql -F owner=<owner> -F repo=<repo> -F number=<number> -f query='query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){comments(last:100){nodes{databaseId viewerDidAuthor authorAssociation createdAt body}}}}}' --jq '.data.repository.pullRequest.comments.nodes[] | select(.body | startswith("<!-- dev-kit:dep-upgrade-check:security -->"))'`
2. The newest one with `viewerDidAuthor` true is ours: `gh api -X PATCH repos/<owner>/<repo>/issues/comments/<databaseId> -F body=@<file>`. Never edit another author's marker comment, even though a token with write access can.
3. With none of ours, `gh pr comment <url> --body-file <file>`.

Post it when the outcome is final: right away for clear and blocked, and after the user's decision for escalated. An unattended run posts an escalated outcome right away too.

**Carried decision**: bots rebase their PRs, and every push re-runs an unattended check, which must not wipe out a maintainer's answer. A maintainer records a decision in their own session, which posts under their login, not the bot's, so the source is the newest marker comment from upsert step 1 that holds a Decision other than `pending` and was written by us or by an author whose `authorAssociation` is `OWNER`, `MEMBER` or `COLLABORATOR`. A Decision in anyone else's comment is never carried: anyone can post the marker. When such a Decision exists, and the units, their targets, and the IDs of the advisories that escalate them are all unchanged, an unattended run keeps that Decision line verbatim, and its result block reports the decision the line records (`accepted`, `switched`, `refresh` or `hold`) with `decision_carried: true`. When any of them changed, the Decision goes back to `pending` and the comment says what changed.

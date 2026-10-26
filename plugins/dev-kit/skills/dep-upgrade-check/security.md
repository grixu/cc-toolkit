# Security record lookups

The lookups, rules, and PR comment behind step 2 of the skill. Ecosystem names and release-time sources for non-npm units are in [`ecosystems.md`](ecosystems.md).

## Which versions to check

- **Every unit**: its current and its target version.
- **Transitive versions the upgrade brings in**:
  - **PR input**: every package whose resolved version is new or changed between the base branch's lockfile and the PR head's (`git fetch origin pull/<number>/head`, then `git show FETCH_HEAD:<lockfile>` against `git show origin/<baseRefName>:<lockfile>`). A changed one is checked against its base version; a new one has no base version.
  - **Package + version input**: `GET https://api.deps.dev/v3/systems/<npm|pypi>/packages/<urlencoded name>/versions/<v>:dependencies` for current and target, then check the nodes of the target that the current graph lacks. deps.dev resolves the graph in isolation, not against the project's lockfile, so the report calls this set approximate. Other ecosystems get `transitive not checked`, and the step-5 worktree install settles it from the lockfile it writes.
- **Private packages are never sent anywhere**: a package resolved from a host other than the public registry is listed as `not checked: private registry`, and its name goes to no OSV, GitHub, or deps.dev query. Signs: a `tarball`/`resolved` URL on another host in the lockfile, a scoped `@scope:registry=` in `.npmrc`, an `index-url`/`[[tool.uv.index]]`/poetry `source` other than PyPI, a module matched by `GOPRIVATE`, a Composer `repositories` entry, a non-crates.io `source` in `Cargo.lock`.

## Lookups

1. **OSV**, every ecosystem except GitHub Actions. One batch for all versions above. Write the payload to a file and post it with `curl -s https://api.osv.dev/v1/querybatch -d @<file>`. The payload looks like `{"queries":[{"package":{"name":"<pkg>","ecosystem":"<OSV ecosystem>"},"version":"<v>"}, ...]}`. The batch returns IDs only, so fetch each distinct ID with `curl -s https://api.osv.dev/v1/vulns/<id>`. A result with `next_page_token` needs a follow-up query carrying that token.
2. **GitHub Advisory Database**, for EPSS, `first_patched_version`, and `vulnerable_functions`, and the only source for GitHub Actions (OSV version queries for Actions return nothing). Make two calls per version:
   - `gh api -X GET /advisories -f ecosystem=<e> -f affects=<pkg>@<v> --paginate`;
   - the same with `-f type=malware`. The endpoint leaves malware out unless asked.

Merge both sources into one record per advisory, deduplicated through `aliases`, which link a `GHSA-*`, `CVE-*`, `MAL-*`, `PYSEC-*`, `RUSTSEC-*` or `GO-*` ID to the others. Drop an advisory with `withdrawn` set or a summary starting `Duplicate Advisory`.

## Rules

- **Severity** is the GHSA `severity`, else OSV `database_specific.severity`. An advisory with neither (most `GO-*` and `RUSTSEC-*` records) counts as **moderate**. An `unreviewed` GHSA counts at its stated severity and carries the label `unreviewed`.
  - Advisories at moderate or above drive the outcome.
  - Low ones appear in the report and the comment as a count only.
- **Malware** is any `MAL-*` ID or a GHSA of type `malware`, at any severity.
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

**Minimum safe version**, for a blocked or escalated unit: the lowest version above current with no advisory at moderate or above and no malware, that is out of cooldown or exempt from it. Check candidates in ascending semver order with the same lookups. Say when none exists up to `latest`.

## PR comment

A PR input always gets one security comment, also when every unit is `clear`, and a re-run updates it instead of adding another. Write it in English, to a file, starting with the marker line:

```markdown
<!-- dev-kit:dep-upgrade-check:security -->
### Dependency security check: <clear | escalated | blocked>

<one line per unit: `pkg current → target`: outcome and reason; for blocked/escalated the minimum safe version>

| Advisory | Severity | Summary | Affected → fixed | vs current | Codebase use |
|---|---|---|---|---|---|
| [GHSA-xxxx](https://github.com/advisories/GHSA-xxxx) (CVE-…) | high · EPSS 86th pct | … | `<1.15.0` → 1.15.0 | still present | `src/http.ts:12` / not found / unknown |

- **Malware / registry / cooldown / provenance**: one line each that applies.
- **Transitive**: advisories and cooldowns on versions the upgrade brings in, or `none`; `approximate` for a deps.dev graph.
- **Low severity**: <count>, or `none`.
- **Not checked**: private packages, ecosystems without a transitive source.
- **Decision** (escalated only): <accepted risk | switched target to X | hold>, by @<login>, <date>, <reason if given>.

Sources: OSV.dev, GitHub Advisory Database, deps.dev; queried <ISO timestamp>.
```

Upsert:
1. `gh api user --jq .login`.
2. `gh api repos/<owner>/<repo>/issues/<number>/comments --paginate --jq '.[] | select(.user.login == "<login>" and (.body | startswith("<!-- dev-kit:dep-upgrade-check:security -->"))) | .id'`.
3. With an ID, `gh api -X PATCH repos/<owner>/<repo>/issues/comments/<id> -F body=@<file>`. Without one, `gh pr comment <url> --body-file <file>`.

Post it when the outcome is final: right away for clear and blocked, and after the user's decision for escalated.

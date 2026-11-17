# Release-age cooldown

How long a version must have been published before the skill takes it, per version checked: the target, and every changed or new transitive version. The value comes from the configuration of the repository being checked; 7 days applies only when the repository configures nothing.

For a PR input, read every file below from the base branch (`git show origin/<baseRefName>:<path>`), never from the PR head or the working tree: a PR must not lower its own cooldown. Otherwise read them from the working tree.

## Source

The first source that sets a value for the version wins; the others are not consulted. A source whose file exists but sets nothing for the version falls through to the next one.

1. **Renovate**: the first file found of `renovate.json`, `renovate.json5`, `.github/renovate.json`, `.github/renovate.jsonc`, `.github/renovate.json5`, `.gitlab/renovate.json`, `.gitlab/renovate.jsonc`, `.gitlab/renovate.json5`, `.renovaterc`, `.renovaterc.json`, `.renovaterc.jsonc`, `.renovaterc.json5`, or the `renovate` key of the root `package.json`.
2. **Dependabot**: `.github/dependabot.yml` with an `updates` entry for the version's ecosystem and directory.
3. **pnpm**: `minimumReleaseAge` set in `pnpm-workspace.yaml`, for npm versions only. pnpm's built-in default does not count as configuration.
4. **Default**: 7 days.

When a bot source wins and `pnpm-workspace.yaml` also sets a longer `minimumReleaseAge`, add a note to the cooldown line: pnpm refuses to install a version younger than its value, so an install in CI fails on it.

## Renovate

Start from the top-level `minimumReleaseAge`, then walk `packageRules` in order. Every rule whose matchers all match the version sets the value it carries; a later rule overrides an earlier one. A rule that does not set `minimumReleaseAge` changes nothing.

- **Values**: a duration string (`3 days`, `1 week`, `12 hours`). An explicit `null` or `0 days` means no cooldown.
- **Unset**: when neither the top level, nor a matching rule, nor a resolved preset sets `minimumReleaseAge`, Renovate sets nothing for the version and the next source decides, down to the default (`cooldown 7 days (default; renovate.json sets no minimumReleaseAge)`). Only a key that is present with `null` turns the cooldown off.
- **Presets**: the rules of presets in `extends` come before the file's own `packageRules`, and a preset rule still overrides the file's top-level value. `config:best-practices` and `security:minimumReleaseAgeNpm` add one rule: `matchDatasources: ["npm"]`, `3 days`. Other presets are not resolved: name them in the cooldown line (`presets not resolved: local>org/renovate-config`). `config:recommended` sets no release age and needs no mention.

Matchers the skill evaluates:

| Matcher | Compared with |
|---|---|
| `matchUpdateTypes` | the update type: `major`, `minor`, or `patch` from the semver difference between the version replaced and the new one (a Docker tag compares its numeric part; a changed digest under the same tag is `digest`). On a Renovate PR, the `Update` column of the body's table gives it directly. A new transitive package replaces nothing and has no update type, so a rule with this matcher does not match it. |
| `matchPackageNames` | the package name. Patterns: an exact name or a glob (both case-insensitive), `/regex/` or `/regex/i`, and `!` before either to exclude. With any positive pattern, at least one must match; no negative pattern may match. |
| `matchDatasources`, `matchManagers` | the table below. |
| `matchDepTypes` | the dependency type: the manifest section (`dependencies`, `devDependencies`, …), or the `Type` column of a Renovate PR's table. |
| `matchFileNames` | the path of the manifest or lockfile that declares the version, from the repository root, as an exact path or a glob. |

| Version comes from | `matchManagers` | `matchDatasources` |
|---|---|---|
| `package.json` dependency | `npm` | `npm` |
| `engines.node`, `volta.node` in `package.json` | `npm` | `node-version` |
| `.nvmrc` | `nvm` | `node-version` |
| `.node-version` | `nodenv` | `node-version` |
| `FROM` in a Dockerfile | `dockerfile` | `docker` |
| `image:` in a Compose file | `docker-compose` | `docker` |
| `uses:` in a workflow or composite action | `github-actions` | `github-tags` |
| `pyproject.toml` | `pep621`, or `poetry` for a `[tool.poetry]` section | `pypi` |
| `requirements*.txt` | `pip_requirements` | `pypi` |
| `go.mod` | `gomod` | `go` |
| `composer.json` | `composer` | `packagist` |
| `Cargo.toml` | `cargo` | `crate` |

**Matchers the skill cannot evaluate** (`matchCurrentVersion`, `matchCurrentValue`, `matchNewValue`, `matchJsonata`, `matchCurrentAge`, `matchConfidence`, a custom datasource or manager, and any other `match*` key not in the table): when every other matcher of the rule matches, the rule may apply. Take the stricter of its value and the value it would override, and say so in the cooldown line (`rule not evaluated: matchCurrentVersion`).

## Dependabot

Take the `updates` entry whose `package-ecosystem` matches the version (`npm` for npm, pnpm and yarn; `docker`, `github-actions`, `pip`, `uv`, `gomod`, `composer`, `cargo`) and whose `directory` or `directories` holds the manifest that declares it.

- **No `cooldown` block**: 3 days, Dependabot's own default for version updates.
- **`cooldown`**: `semver-major-days`, `semver-minor-days` or `semver-patch-days` for the update type, falling back to `default-days`, and to 3 days when that is missing too. A new transitive package gets `default-days`.
- **`include` / `exclude`** list package names with `*` wildcards. A package in `exclude`, or outside a non-empty `include`, has no cooldown. `exclude` wins when both list it.

## pnpm

`minimumReleaseAge` is in minutes: `4320` is 3 days, and `0` means no cooldown. It applies to direct and transitive versions alike. An entry in `minimumReleaseAgeExclude` exempts a version: a name or a pattern (`@myorg/*`) exempts every version of the package, and `pkg@1.2.3` or `pkg@1.2.3 || 1.2.4` only those versions.

## Cooldown line

Each version checked gets one line naming the value and where it came from:

- `cooldown 3 days (renovate.json packageRules[2]: matchUpdateTypes patch)`
- `no cooldown (renovate.json packageRules[4]: matchDatasources docker, null)`
- `cooldown 3 days (.github/dependabot.yml: Dependabot default, no cooldown block)`
- `cooldown 1 day (pnpm-workspace.yaml minimumReleaseAge 1440)`
- `cooldown 7 days (default)`

Versions that share a value and a source can share a line. The `blocked` reason and the date the version becomes acceptable use the same value.

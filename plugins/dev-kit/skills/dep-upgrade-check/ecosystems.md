# Ecosystem equivalents

The skill's steps hold for every ecosystem; only the lookups change. Once the source repository is known, GitHub Releases, the changelog file, the migration guide, and the `gh api .../compare/...` commit range work the same everywhere.

| Ecosystem | Resolved version and dependents | Published versions | Source repo and requirements |
|---|---|---|---|
| npm | `npm ls <pkg> --all` | `npm view <pkg> versions --json` | `npm view <pkg>@<v> repository engines peerDependencies exports --json` |
| yarn | `yarn why <pkg>` | `npm view <pkg> versions --json` | as npm |
| Python | the lockfile in use (`uv.lock`, `poetry.lock`, pinned `requirements*.txt`); `uv tree --invert --package <pkg>` | `https://pypi.org/pypi/<pkg>/json` (`releases` keys) | same JSON: `info.project_urls`, `info.requires_python`, `info.requires_dist` for one version at `/pypi/<pkg>/<v>/json` |
| Go | `go list -m all`, `go mod why -m <module>` | `go list -m -versions <module>` | the module path is the repo; `go.mod` at the target tag gives the `go` directive and requirements |
| PHP | `composer show <pkg>`, `composer why <pkg>` | `composer show --all <pkg>` | `composer why-not <pkg> <target>` names what blocks the target, including the `php` constraint |
| Rust | `cargo tree -i <crate>` | `cargo info <crate>` or `https://crates.io/api/v1/crates/<crate>/versions` | `Cargo.toml` at the target tag: `rust-version`, features, dependencies |
| Container image | the tag or digest on `FROM` and `COPY --from=` lines; those lines are the usage surface | the registry's tags (`https://hub.docker.com/v2/repositories/<namespace>/<image>/tags` on Docker Hub) | the vendor repository's tags, often in a monorepo (`<component>-1.11.0`), or the image's registry page; compare base image, `ENTRYPOINT` and `USER` between both tags |
| GitHub Actions | `uses: <owner>/<repo>@<ref>` pins in `.github/workflows/` and composite actions | `gh release list -R <owner>/<repo>` or `gh api repos/<owner>/<repo>/tags` | `action.yml` at the target tag: `inputs`, `outputs`, and the node version in `runs.using` |

Ecosystem traps that change the ledger:

- **Go**: a major version from v2 onward is a different module path (`example.com/mod/v3`), so the upgrade rewrites every import path of the module; the usage surface is every import of the old path.
- **Python**: a dropped `requires-python` floor or a removed extra breaks installation before any API is touched; record both from the metadata diff.
- **Rust**: a removed or renamed feature breaks `Cargo.toml` feature lists; check the features the codebase enables against the target's `[features]`.
- **PHP**: a raised `php` constraint in the target's `require` shows up only in `composer why-not`, not in the release notes.

# Changelog

All notable changes to the **dev-kit** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `ci-fix` skill: locate a failed GitHub Actions run from a URL or the current branch, fix it at its root cause, verify locally, and commit; pushes on consent, or unattended with `push-authorized`
- `pr-shepherd` skill: self-paced `/loop` that drives the current branch's PR until CI is green and review threads are resolved, fixing CI via `ci-fix`, committing justified review changes, and rebutting unjustified comments in-thread
- `dep-upgrade-check` skill: read-only compatibility check of a dependency upgrade (package + version, or a Renovate/Dependabot PR) against the codebase, with a verdict and file:line impact table
- `pr-open` skill: push the current branch and open a PR that fills the repository's PR template in Smart Brevity style

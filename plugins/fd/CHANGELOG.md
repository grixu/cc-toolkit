# Changelog

All notable changes to the `fd` plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of feature-delivery v2 from the spec set in `docs/`:
  eight commands (`/fd:config`, `/fd:start`, `/fd:from-docs`, `/fd:grill`,
  `/fd:to-tasks`, `/fd:implement`, `/fd:to-prs`, `/fd:status`), four subagents
  (researcher, validator, copy-refresher, merger), shared reference blocks,
  dependency-free Node.js scripts (hasher, projections, token estimator,
  schema migrations), JSON Schemas for all workspace artifacts, golden tests,
  and promptfoo e2e smoke evals.

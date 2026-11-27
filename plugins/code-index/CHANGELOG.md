# Changelog

All notable changes to the **code-index** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `setup` skill: scans a repository, agrees exclusions, model and call graph with the user, registers the zvec-grep MCP server at local scope, writes the rules to `CLAUDE.local.md`, and builds the index.
- `scripts/scan.sh`: summary of what a zvec-grep index would contain, with generated-looking paths and text files with NUL bytes.
- `scripts/index-guard.sh`: builds an index and stops it on the first GPU-to-CPU fallback; excludes text files with NUL bytes before the build.

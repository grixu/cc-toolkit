# Changelog

All notable changes to the **session-learner** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `/learn` skill with 5-phase conversation analysis workflow
- Friction signal extraction (corrections, repeated instructions, deviations, new patterns)
- Interactive review with Accept/Modify/Skip per finding
- Auto memory deduplication (reads existing memory before proposing)
- Dynamic discovery of `.claude/rules/` and `CLAUDE.md` files
- Optional hookify integration for regex-findable repeated errors
- ANALYSIS-GUIDE.md reference with generic examples and anti-patterns

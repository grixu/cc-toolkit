# Changelog

All notable changes to the **fast-jev-compaction** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-24

### Added

- Ported from tamaratran/fast-jev-compaction 0.3.0 (MIT), as a Claude Code plugin only: the npm library entry points and the demo are not included.
- Gemini Decision (`gemini-decision-1`) as a backend: the `backend` and `geminiApiKey` options; `auto` takes TypeSafe, then Gemini.
- The Gemini key falls back to `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`; the TypeSafe key to `TYPESAFE_API_KEY`, as before.

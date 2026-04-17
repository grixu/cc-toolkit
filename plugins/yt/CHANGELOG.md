# Changelog

All notable changes to the **yt** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-17

### Added

- `yt` skill — end-to-end orchestrator: extract URLs, check transcript cache, transcribe fresh URLs in a background agent, gather user preferences via `AskUserQuestion`, then process all transcripts in parallel subagents
- `yt-transcribe` sub-skill — download audio with `yt-dlp`, transliterate filenames to ASCII, transcribe with ElevenLabs Scribe v2 (diarization + audio events), emit Markdown
- `yt-process` sub-skill — three processing modes: `summary`, `news` (domain-specific novelty extraction), `custom` (user-defined prompt)
- Prebuilt transcription bundle at `scripts/transcript_audio/` (transcribe.mjs + transliterate.mjs) — ships ready to run, no `pnpm install` required at install time
- `tools/transcript_audio/` workspace with `tsdown.config.ts` for rebuilding the bundle
- `scripts/build-bundles.sh` helper for rebuilding bundles during development/release

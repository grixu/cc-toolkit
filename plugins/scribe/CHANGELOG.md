# Changelog

All notable changes to the **scribe** plugin (formerly **yt**) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING**: Plugin renamed from `yt` to `scribe`. The plugin now covers transcription pipelines from any source (YouTube, local audio/video), not just YouTube. Reinstall via `/plugin install scribe@cc-toolkit` after uninstalling `yt`.
- `yt-process` skill renamed to `transcript-process` — it was always source-agnostic; the new name reflects that. No backwards-compatible alias.
- README rewritten to cover both YouTube and local-file flows, with a Migration section.

### Added

- `local` orchestrator skill — full pipeline for local audio/video files: discover paths/globs/folders, hash-based cache lookup, ffmpeg audio extraction (via sub-skill), ElevenLabs transcription, parallel processing, per-source report.
- `local-transcribe` sub-skill — handles individual local files: SHA-256 hash, audio passthrough (mp3/m4a/wav/ogg/flac/opus/aac) or ffmpeg video → mp3 extraction (mp4/mov/mkv/webm/avi/m4v/wmv/ts/flv/3gp/amr/wma), filename transliteration, sequential ElevenLabs Scribe calls.
- SHA-256 content-based caching for local files in `transcripts/local-index.json` (separate from the YouTube `transcripts/index.json`). Moving or renaming a file does not invalidate the cache; modifying it does.
- Path, glob, and folder expansion for local inputs. Glob patterns support `**` for recursive discovery; folder expansion is flat (depth=1) by default.
- Confirmation prompt when more than 5 files are in scope, to guard against accidental large-batch transcription.
- Per-orchestrator analysis reports: `yt-analysis-*.md` (YouTube) and `local-analysis-*.md` (local).
- Mixed-input handling: when a single message contains both YouTube URLs and local paths, the matched orchestrator finishes its full pipeline first, then sequentially spawns the other orchestrator for leftover items. Each writes its own analysis report.
- Filename collision suffix (`_2`, `_3`, ...) when archiving multiple items with the same transliterated stem on the same day.
- News mode in `local` uses domain-neutral options (`Bez kategorii / Branża/produkt / Tematyczny`) instead of YT-tech-biased ones.

## [0.1.0] - 2026-04-17

### Added

- `yt` skill — end-to-end orchestrator: extract URLs, check transcript cache, transcribe fresh URLs in a background agent, gather user preferences via `AskUserQuestion`, then process all transcripts in parallel subagents
- `yt-transcribe` sub-skill — download audio with `yt-dlp`, transliterate filenames to ASCII, transcribe with ElevenLabs Scribe v2 (diarization + audio events), emit Markdown
- `yt-process` sub-skill — three processing modes: `summary`, `news` (domain-specific novelty extraction), `custom` (user-defined prompt)
- Prebuilt transcription bundle at `scripts/transcript_audio/` (transcribe.mjs + transliterate.mjs) — ships ready to run, no `pnpm install` required at install time
- `tools/transcript_audio/` workspace with `tsdown.config.ts` for rebuilding the bundle
- `scripts/build-bundles.sh` helper for rebuilding bundles during development/release

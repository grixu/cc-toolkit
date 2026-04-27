# scribe

Transcription + analysis pipeline for Claude Code. Point it at YouTube URLs **or** local audio/video files, pick a processing mode, and get a Markdown report with summaries, domain news, action items, or any custom extraction — grounded in real transcripts.

Powered by ElevenLabs Scribe for transcription, `yt-dlp` for YouTube downloads, and `ffmpeg` for local-file audio extraction.

## Skills

| Skill | Source | Trigger |
|---|---|---|
| `yt` | YouTube URLs | URL + analysis intent ("podsumuj te filmy", "co nowego w AI", "summarize these videos") |
| `local` | Local audio/video files | path with audio/video extension + intent ("transkrybuj te nagrania", "podsumuj meeting", "extract action items") |
| `yt-transcribe` | sub-skill | YouTube → raw transcription only, no processing |
| `local-transcribe` | sub-skill | Local file → raw transcription only, no processing |
| `transcript-process` | sub-skill | Run on an existing transcript (any source) |

The orchestrators (`yt`, `local`) handle end-to-end. Sub-skills are usable standalone if you only want one stage of the pipeline.

## How it works

```
1. Extract inputs — URLs (yt) or paths/globs/folders (local)
2. Cache check — transcripts/index.json (URL key) or local-index.json (SHA-256 key)
3. For fresh items: background agent runs yt-dlp+ffmpeg+Scribe (yt) or ffmpeg+Scribe (local)
4. While transcription runs, ask you:
     - Mode: summary / news / custom prompt
     - Focus, narrowing, or the prompt itself
5. Archive new transcripts under transcripts/YYYY-MM-DD/, update the index
6. Spawn one processing subagent per item (parallel)
7. Write per-source report: yt-analysis-*.md or local-analysis-*.md
```

Processing modes:

- **summary** — proportional digest (5–20% of transcript length), optional focus
- **news** — domain-specific novelty extraction, optional narrowing
- **custom** — your own prompt applied to each transcript

The `local` orchestrator's news mode uses neutral domain options (`Bez kategorii / Branża/produkt / Tematyczny`) instead of the YT-tech-biased ones (`AI/ML / Frontend / Backend`).

## Local file inputs

`local` accepts three input types:

| Type | Example |
|---|---|
| Explicit path | `~/Recordings/meeting.mp4` |
| Glob | `~/Recordings/*.m4a` or `~/projects/**/audio/*.mp3` |
| Folder | `~/Recordings/` (flat, depth=1; use `**` glob for recursive) |

Supported extensions:

- **Audio** (passthrough, no conversion): `mp3 m4a wav ogg flac opus aac`
- **Video** (ffmpeg → mp3): `mp4 mov mkv webm avi m4v wmv ts flv 3gp amr wma`

When more than 5 files are in scope, `local` confirms before transcribing — ElevenLabs is not free.

## Mixed input

Drop a YouTube URL **and** a local path in the same message. The matched orchestrator finishes its full pipeline first (transcribe + process + write report), then sequentially spawns the other orchestrator for the leftover items. You'll get two separate analysis reports — one per source.

## Requirements

| Tool | Install | Required for |
|---|---|---|
| **Node.js ≥ 20** | [nodejs.org](https://nodejs.org) | Both flows (bundled transcription script) |
| **`ELEVENLABS_API_KEY`** | [ElevenLabs API keys](https://elevenlabs.io/app/settings/api-keys) | Both flows (transcription credential) |
| **ffmpeg** | `brew install ffmpeg` | Both flows (audio extraction) |
| **yt-dlp** | `brew install yt-dlp` | YouTube only |
| `shasum` | macOS coreutils (preinstalled) | Local files (SHA-256 cache key) |

Set the API key in your shell profile (`~/.zshrc` / `~/.bashrc`):

```bash
export ELEVENLABS_API_KEY="sk_..."
```

No `pnpm install` needed — the plugin ships a prebuilt transcription bundle in `scripts/transcript_audio/`.

## Installation

```
/plugin install scribe@cc-toolkit
```

## Migration from yt

This plugin was previously called `yt` (YouTube-only). It has been renamed to `scribe` and now covers transcription pipelines from any source.

If you had `/plugin install yt@cc-toolkit`:

1. **Uninstall** the old plugin: `/plugin uninstall yt`
2. **Install** the new one: `/plugin install scribe@cc-toolkit`

Your existing artifacts are preserved:

- `transcripts/YYYY-MM-DD/*.md` — kept, still reused as cache
- `transcripts/index.json` — kept, still the YouTube cache (schema unchanged)
- `yt-analysis-*.md` reports — kept, still produced by the `yt` skill

The `yt-process` skill was renamed to `transcript-process` (it was always source-agnostic). If you had any custom code referencing `${CLAUDE_PLUGIN_ROOT}/skills/yt-process/`, update the path. There is no backwards-compatible alias.

## Output

Per run the plugin writes:

- `transcripts/YYYY-MM-DD/<Safe_Title>.md` — raw transcript (cached for future runs)
- `yt-analysis-YYYY-MM-DD-HHMMSS.md` (yt orchestrator) **or** `local-analysis-YYYY-MM-DD-HHMMSS.md` (local orchestrator) — combined report with TOC, per-item sections, transcript index, errors appendix

Caches:

- `transcripts/index.json` — YouTube items, keyed by URL
- `transcripts/local-index.json` — local files, keyed by SHA-256 of source content

The archive directory `transcripts/YYYY-MM-DD/` is shared across both orchestrators; collisions are handled by suffixing `_2`, `_3`, etc.

## Gotchas

- **Playlist URLs are blocked by default** in `yt-transcribe` — pass individual video URLs.
- **Age-restricted / private YouTube** — `yt-dlp` may need `--cookies-from-browser chrome`. The skill surfaces the error and suggests the fix.
- **Polish diacritics in filenames** — transliterated (`zarządzać` → `zarzadzac`) for shell safety; transcript content preserves diacritics.
- **Sequential transcription** — ElevenLabs is called one item at a time to stay under rate limits. Multi-item batches parallelize *processing*, not transcription.
- **Local file cache key is content hash** — modifying a file (re-encode, edit) invalidates cache; moving or renaming it does not.
- **Folder expansion is flat by default** — use an explicit `**` glob for recursive discovery.
- **Confirmation at >5 files** — the `local` skill asks before kicking off large batches; ElevenLabs charges per call.

## Development

The transcription script lives in `tools/transcript_audio/` and is bundled with [tsdown](https://tsdown.dev/) (rolldown) into `scripts/transcript_audio/`. To rebuild:

```bash
./plugins/scribe/scripts/build-bundles.sh
```

Commit the regenerated bundles before cutting a release. See `CHANGELOG.md` for the release log.

## License

MIT — part of [cc-toolkit](https://github.com/grixu/cc-toolkit).

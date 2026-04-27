# scribe — plugin conventions

This file documents conventions specific to the `scribe` plugin. The repo-level [`CLAUDE.md`](../../CLAUDE.md) covers monorepo-wide rules; everything here is plugin-local.

## Skill structure

Five skills in `skills/`:

| Skill | Role |
|---|---|
| `yt/` | Orchestrator for YouTube URLs |
| `local/` | Orchestrator for local audio/video files |
| `yt-transcribe/` | Sub-skill: yt-dlp + ElevenLabs Scribe |
| `local-transcribe/` | Sub-skill: ffmpeg (or audio passthrough) + ElevenLabs Scribe |
| `transcript-process/` | Source-agnostic processing (summary / news / custom) |

The two orchestrators are independent and never share state at runtime — they only share the bundled scripts in `scripts/transcript_audio/` and the archive directory `transcripts/YYYY-MM-DD/`. They have separate cache index files.

## Cache identity

| Source | Index file | Cache key |
|---|---|---|
| YouTube | `transcripts/index.json` | URL string (`https://...`) |
| Local file | `transcripts/local-index.json` | SHA-256 of source file content (`sha256:<hex>`) |

These index files are **never merged**. Each orchestrator reads/writes only its own.

The hash key is computed on the **source file**, not on any ffmpeg-converted intermediate — ffmpeg output is not bit-stable across runs, so it would produce a useless cache key.

## Archive directory

`transcripts/YYYY-MM-DD/<safe_stem>.md` — shared between both orchestrators. Filename collisions (e.g. two files transliterating to the same stem on the same day) are resolved by suffixing `_2`, `_3`, ... The hash/URL in the index is the actual identity, so renamed files don't break.

## Filename transliteration

Both `yt-transcribe` and `local-transcribe` use `${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transliterate.mjs` to produce ASCII-only filenames. This is shell-safe and cross-platform. The transcript **content** preserves diacritics.

## Local-file extension whitelist

Used by `local` for folder/glob expansion (explicit paths bypass this — they're passed straight through to ffmpeg, which decides):

- Audio (passthrough, no ffmpeg conversion): `mp3 m4a wav ogg flac opus aac`
- Video (ffmpeg → mp3): `mp4 mov mkv webm avi m4v wmv ts flv 3gp amr wma`

Audio passthrough exists because re-encoding mp3 → mp3 loses quality and wastes time. Scribe accepts these formats directly.

## Mixed-input handling

When a message contains both URLs and paths, the matched orchestrator handles its own input fully (transcribe + process + write its report), then sequentially spawns the other orchestrator for leftovers. Two independent reports get written. There is no merged-output mode — that was deliberately rejected to keep each orchestrator's logic simple.

The detection regexes:

- YouTube URLs: `https?://(www\.)?(youtube\.com|youtu\.be)/...`
- Path-like tokens with audio/video extension: tokens starting `/`, `~/`, `./`, `../` and ending with a whitelisted extension
- Folder/glob paths combined with intent keywords (`transkrybuj`, `podsumuj`, `transcribe`, etc.)

When ambiguous, prefer to skip — better miss-trigger than false-trigger.

## Bundled scripts

`scripts/transcript_audio/` contains pre-built bundles of the source in `tools/transcript_audio/`. The bundle ships with the plugin so users don't need `pnpm install` at install time.

To rebuild after editing `tools/transcript_audio/`:

```bash
./plugins/scribe/scripts/build-bundles.sh
```

Always commit the regenerated bundles before cutting a release.

## Releasing

Use the repo-level release script:

```bash
./scripts/release.sh scribe minor
```

The script bumps `plugin.json` and the `marketplace.json` entry, stamps the CHANGELOG, commits, tags as `scribe/v<version>`, and (after confirmation) pushes + creates a GH release.

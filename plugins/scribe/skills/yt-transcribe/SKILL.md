---
name: yt-transcribe
description: "Download YouTube videos as audio and transcribe them to text using yt-dlp and ElevenLabs Scribe. Use whenever the user shares YouTube URLs/links and wants transcription, audio extraction for transcription, or text content from videos. Triggers on: YouTube links with transcription intent, 'transcribe this video', 'get text from YT', 'download and transcribe', 'what does this video say', or any request combining YouTube URLs with text extraction."
---

# yt-transcribe

Extract audio from YouTube videos and transcribe them to Markdown using `yt-dlp` + an ElevenLabs Scribe transcription script.

## Before you start — think about what you're downloading

Not all YouTube content is worth transcribing. Before downloading anything, ask yourself:
- **Is this speech?** Music videos, ambient recordings, or soundscapes will produce garbage transcriptions. If the title/description suggests non-speech content, warn the user before wasting API quota.
- **Is it a screencast with mostly silence?** Coding tutorials or UI demos may have long silent stretches — transcription will work but the output will be sparse and fragmented.
- **How many URLs?** Each one costs an ElevenLabs API call. For 5+ URLs, confirm with the user that they want all of them.

Then classify the URLs:

| URL pattern | Type | Action |
|---|---|---|
| `watch?v=ID` or `youtu.be/ID` | Single video | Download directly |
| `watch?v=ID&list=PLID` | Video in playlist | Download only the single video — use `--no-playlist` |
| `playlist?list=PLID` | Full playlist | **Stop and ask the user** — they likely want specific videos, not 200 downloads |
| `shorts/ID` | YouTube Short | Download directly (works like a regular video) |
| `/live/ID` or `watch?v=ID` with `is_live` | Live stream | **Skip and warn** — can't extract audio from an ongoing stream |

This classification matters because yt-dlp silently expands playlists by default, which can trigger hundreds of downloads the user didn't intend.

## Prerequisites

Verify before doing anything — if any check fails, tell the user what's missing:

1. `yt-dlp` is in PATH — `which yt-dlp`
2. `ffmpeg` is in PATH — `which ffmpeg` (yt-dlp needs it for audio extraction; without it, `-x` silently fails or downloads video instead)
3. `ELEVENLABS_API_KEY` env var is set — confirm non-empty without printing the value
4. `${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transcribe.mjs` and `${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transliterate.mjs` exist (shipped with the plugin — no install step needed)
5. Node.js ≥ 20 is on PATH — `node --version`

## NEVER do this

- **NEVER omit `--no-playlist`** when the URL contains both `v=` and `list=`. Without it, yt-dlp downloads the entire playlist instead of the single video the user pointed to.
- **NEVER use `--restrict-filenames`**. It replaces Polish diacritics (and other non-ASCII) with underscores, producing garbage like `Jak_zarz_dza__firm_`. We want proper transliteration (`Jak_zarzadzac_firma`) via `transliterate.mjs` instead. Use `--windows-filenames` to strip only truly-forbidden shell chars (`:`, `?`, `*`, `"`, `|`, `<`, `>`, `/`, `\`).
- **NEVER assume ffmpeg is installed**. Audio extraction (`-x`) depends on ffmpeg. If it's missing, yt-dlp may silently download the full video file or produce a webm instead of mp3.
- **NEVER run multiple `transcribe.mjs` invocations in parallel**. The ElevenLabs API has rate limits — parallel calls risk 429 errors and failed transcriptions. Process sequentially.
- **NEVER pass a playlist URL to download without explicit user confirmation**. A playlist can contain hundreds of videos; downloading all of them wastes time, disk, and API quota.
- **NEVER use `--audio-quality 0`** (best quality) for transcription purposes. It inflates file size 3-5x for no benefit — speech recognition models don't gain accuracy from lossless audio. Default quality is fine.
- **NEVER ignore HTTP 429 errors from yt-dlp**. YouTube rate-limits aggressive sequential downloads. If you hit a 429, wait 30-60 seconds before retrying — don't just hammer the next URL immediately.

## Workflow

### 1. Create a temp directory

```bash
WORKDIR=$(mktemp -d /tmp/yt-audio-XXXXXX)
```

### 2. Download audio + capture title

For each URL, download as mp3 and capture the human-readable title (kept for the index) plus the on-disk path:

```bash
yt-dlp -x --audio-format mp3 --no-playlist --windows-filenames \
  --print "before_dl:TITLE:%(title)s" \
  --print "after_move:FILEPATH:%(filepath)s" \
  -o "$WORKDIR/%(title)s.%(ext)s" "URL"
```

Flags explained:
- `-x --audio-format mp3` — extract audio, convert to mp3
- `--no-playlist` — only the single video, even if URL contains a playlist ID
- `--windows-filenames` — strip shell-hostile chars (`:`, `"`, `|`, `<`, `>`, `?`, `*`) while preserving Polish diacritics
- `--print before_dl:TITLE:...` — prints the original title before download; parse by prefix
- `--print after_move:FILEPATH:...` — prints the final file path after post-processing

Parse stdout for the `TITLE:` and `FILEPATH:` lines. You'll need both — `title` for the index, `filepath` for the next step.

### 3. Transliterate filename

Rename the mp3 so the filename (and the matching transcript) is clean ASCII:

```bash
DIR=$(dirname "$FILEPATH")
STEM=$(basename "$FILEPATH" .mp3)
SAFE=$("${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transliterate.mjs" "$STEM")
SAFE_PATH="$DIR/$SAFE.mp3"
mv "$FILEPATH" "$SAFE_PATH"
```

If `SAFE` comes back empty (pathological input), fall back to the original `$FILEPATH`.

### 4. Transcribe

For each successfully renamed mp3, run sequentially:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transcribe.mjs" "$SAFE_PATH"
```

The script:
- Uses ElevenLabs Scribe v2 with `diarize: true` and `tagAudioEvents: true`
- Rebuilds the transcript from the `words[]` array — paragraph breaks come from pauses ≥ 1.5s, sentence breaks from pauses ≥ 0.45s, speaker labels inserted when multiple speakers are detected
- Writes a `.md` with the same (transliterated) stem
- Prints the output `.md` path on stdout — capture it

If transcription fails (non-zero exit), record the error for that file and continue.

### 5. Return results

Output a JSON array mapping each original URL to its transcript **and** the human-readable title (the orchestrator needs the title for the index):

```json
[
  {
    "url": "https://www.youtube.com/watch?v=abc",
    "title": "Jak zarządzać firmą — wywiad z Łukaszem",
    "transcript": "/tmp/yt-audio-XXXXXX/Jak_zarzadzac_firma_wywiad_z_Lukaszem.md"
  },
  {
    "url": "https://www.youtube.com/watch?v=def",
    "title": "Other Video",
    "transcript": "/tmp/yt-audio-XXXXXX/Other_Video.md"
  }
]
```

For any URL that failed at download, renaming, or transcription, use an `error` field instead:

```json
{ "url": "https://www.youtube.com/watch?v=ghi", "error": "yt-dlp: video unavailable" }
```

## Edge cases

- **Age-restricted videos** — yt-dlp may fail without cookies. If you see `Sign in to confirm your age`, tell the user and suggest passing `--cookies-from-browser chrome` (or their browser of choice).
- **Private/members-only videos** — will fail with `Private video` or `requires membership`. Report in the error field; nothing the skill can do.
- **Very long videos** (5h+ lectures, conference recordings) — audio-only mp3 stays under 1 GB for most content, but very long recordings could exceed the transcription script's 1 GB limit. If the file is over 750 MB, warn the user before transcribing.
- **Geo-blocked content** — yt-dlp fails with `Video unavailable` or `not available in your country`. No workaround within the skill; report the error.
- **General auth issues** (age-gate, members-only, private) — `--cookies-from-browser <browser>` often resolves these by sending the user's logged-in session. Suggest it whenever yt-dlp fails with an auth-related error, not just for age-restricted content.

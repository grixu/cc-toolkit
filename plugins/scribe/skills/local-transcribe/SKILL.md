---
name: local-transcribe
description: "Transcribe local audio/video files to Markdown via ffmpeg + ElevenLabs Scribe. Use whenever the user provides paths to local audio/video files (mp3, mp4, m4a, wav, mov, mkv, etc.) and wants raw transcription without summarization. Triggers on: paths with audio/video extensions + 'transcribe', 'transkrybuj', 'pobierz tekst z nagrania', 'get transcript of this file'. Sub-skill of `local` orchestrator — usually invoked via that. Use directly when the user wants only transcription, no processing."
---

# local-transcribe

Extract audio from local files (audio passthrough or ffmpeg conversion from video), transcribe via ElevenLabs Scribe, return Markdown transcripts plus content hashes for caching.

## Before you start

For each file, decide what you're dealing with:

- **Audio file** in a Scribe-friendly format (mp3, m4a, wav, ogg, flac, opus, aac) → passthrough, no conversion. We'll just hash + transliterate filename + transcribe.
- **Video file** (mp4, mov, mkv, webm, avi, m4v, wmv, ts, flv, 3gp, amr, wma) → strip audio with ffmpeg → mp3 → transcribe.
- **Anything else** → try ffmpeg anyway; if ffprobe says no audio stream, return an error for that file.

## Prerequisites

Verify before doing anything — if any check fails, tell the user what's missing:

1. `ffmpeg` is in PATH — `which ffmpeg`
2. `ffprobe` is in PATH (ships with ffmpeg) — `which ffprobe`
3. `shasum` is in PATH (macOS coreutils) — `which shasum`
4. `ELEVENLABS_API_KEY` env var is set — confirm non-empty without printing the value
5. `${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transcribe.mjs` and `${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transliterate.mjs` exist (shipped with the plugin)
6. Node.js ≥ 20 is on PATH — `node --version`
7. Each input file exists and is readable — `[[ -r "$path" ]]`

## NEVER do this

- **NEVER skip the content hash.** The hash is the cache key in `transcripts/local-index.json`. Without it the orchestrator can't deduplicate across runs and will re-bill ElevenLabs every time.
- **NEVER convert mp3 → mp3.** If the source is already in a Scribe-friendly audio format, transcribe it directly. Re-encoding loses quality and wastes time.
- **NEVER run multiple `transcribe.mjs` invocations in parallel.** ElevenLabs rate-limits — parallel calls risk 429 errors and failed transcriptions. Process sequentially.
- **NEVER mutate or move the source file.** The user owns it. Work copies / extracted audio go to a temp directory; the original stays where it is.
- **NEVER use `-q:a 0`** (lossless) for ffmpeg audio extraction. It inflates file size 3-5× without improving speech recognition. Use `-q:a 4` (≈128kbps VBR) — fine for speech.
- **NEVER hash the converted mp3.** Hash the source file (whatever format the user pointed at). The cache key is "this user file", not "this conversion artifact" — ffmpeg output is not bit-stable across runs.

## Workflow

### 1. Create a temp directory

```bash
WORKDIR=$(mktemp -d /tmp/scribe-local-XXXXXX)
```

This holds extracted/converted audio. The source files are never modified.

### 2. For each input file

Process **sequentially**, one at a time:

#### 2a. Hash the source

```bash
HASH="sha256:$(shasum -a 256 "$SRC" | awk '{print $1}')"
```

This is the cache key. Pass it through to the output JSON so the orchestrator can update the index.

#### 2b. Decide audio passthrough vs ffmpeg conversion

Get the extension (lowercase):

```bash
EXT="${SRC##*.}"
EXT="$(echo "$EXT" | tr '[:upper:]' '[:lower:]')"
```

If `EXT` ∈ `{mp3, m4a, wav, ogg, flac, opus, aac}` — passthrough. Set `AUDIO_SRC="$SRC"`.

Otherwise — extract audio with ffmpeg:

```bash
STEM="$(basename "$SRC")"
STEM="${STEM%.*}"
AUDIO_SRC="$WORKDIR/$STEM.mp3"
ffmpeg -nostdin -loglevel error -i "$SRC" -vn -acodec libmp3lame -q:a 4 -y "$AUDIO_SRC"
```

If ffmpeg exits non-zero (no audio stream, corrupt file, unsupported format), record the error for this file and continue to the next.

#### 2c. Transliterate the stem

The transcript filename should be ASCII-safe — same convention as `yt-transcribe`:

```bash
STEM="$(basename "$AUDIO_SRC")"
STEM="${STEM%.*}"
SAFE="$("${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transliterate.mjs" "$STEM")"
```

If `SAFE` comes back empty (pathological input), fall back to a sanitized version of `$STEM` (replace non-`[A-Za-z0-9._-]` with `_`).

#### 2d. Stage the audio under the safe name

```bash
SAFE_PATH="$WORKDIR/$SAFE.mp3"
if [[ "$AUDIO_SRC" != "$SAFE_PATH" ]]; then
  if [[ "$AUDIO_SRC" == "$SRC" ]]; then
    cp "$SRC" "$SAFE_PATH"      # passthrough — never move the original
  else
    mv "$AUDIO_SRC" "$SAFE_PATH"  # ffmpeg output lives in WORKDIR; safe to rename
  fi
fi
```

#### 2e. Transcribe

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/transcript_audio/transcribe.mjs" "$SAFE_PATH"
```

The script prints the output `.md` path on stdout — capture it. On non-zero exit, record the error and continue.

### 3. Title

Use the **original filename stem** (pre-transliteration, pre-extension) as the human-readable title. The orchestrator uses this in the index and in the analysis report. Example: `~/Recordings/spotkanie z Łukaszem.mp4` → title `spotkanie z Łukaszem`.

### 4. Return results

Output a JSON array mapping each source path to its transcript path, content hash, and human-readable title:

```json
[
  {
    "source_path": "/Users/me/Recordings/meeting.mp4",
    "source_hash": "sha256:abc123...",
    "title": "meeting",
    "transcript": "/tmp/scribe-local-XXXXXX/meeting.md"
  },
  {
    "source_path": "/Users/me/Recordings/voice memo.m4a",
    "source_hash": "sha256:def456...",
    "title": "voice memo",
    "transcript": "/tmp/scribe-local-XXXXXX/voice_memo.md"
  }
]
```

For any file that failed at hash, conversion, or transcription, use an `error` field instead of `transcript`:

```json
{
  "source_path": "/Users/me/Recordings/broken.mp4",
  "source_hash": "sha256:...",
  "error": "ffmpeg: no audio stream"
}
```

Always include `source_hash` even on error — the orchestrator may want to record the failed attempt.

## Edge cases

- **File doesn't exist or is unreadable** — fail fast for that file: `error: "file not found"` or `error: "permission denied"`. Continue processing the rest.
- **Very large file (> 750 MB)** — warn the user before transcribing; ElevenLabs has a 1 GB cap. If the source is video and > 1 GB, ffmpeg conversion will likely produce something under 1 GB, but it's safest to warn first.
- **Very long file (> 180 min via `ffprobe`)** — warn before transcribing. Each hour costs ≈ $0.30 on Scribe; a 4-hour conference recording is ≈ $1.20.
- **No audio stream** (e.g. silent video, animated GIF) — ffmpeg will fail at extraction. Surface the stderr verbatim in the error field.
- **Non-Latin filenames** — transliteration handles diacritics and most scripts. Pure-emoji filenames may produce empty `SAFE`; the fallback sanitization keeps things working.
- **Symlinks** — hash and transcribe whatever the symlink points to. If the target is missing, treat as "file not found".
- **Source already in WORKDIR** — shouldn't happen in normal use, but if it does, the cp/mv logic handles it without clobbering.

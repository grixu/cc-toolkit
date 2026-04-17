# yt

YouTube video analysis pipeline for Claude Code. Point it at one or more YouTube URLs, pick a processing mode, and get a Markdown report with summaries, domain news, or any custom extraction — grounded in real transcripts, not just the video description.

## Skills

| Trigger | Description |
|---|---|
| YouTube URL + "podsumuj" / "summarize" | Full pipeline — transcribe + summarize |
| YouTube URL + "co nowego w AI" / "what's new" | Domain news extraction from the video |
| "przetwórz transkrypcję" / "process this transcript" | Run `yt-process` on an existing transcript |
| "pobierz transkrypcję" / "transcribe this video" | `yt-transcribe` only, no processing |

The `yt` skill is the orchestrator — use it for end-to-end. `yt-transcribe` and `yt-process` are sub-skills called internally but also usable standalone.

## How it works

```
1. Extract all YouTube URLs from your message
2. Look up transcripts/index.json — reuse anything already transcribed
3. For new URLs: spawn a background agent that runs yt-dlp + ElevenLabs Scribe
4. While transcription runs, ask you:
     - Mode: summary / domain news / custom prompt
     - Focus, narrowing, or the prompt itself
5. Archive new transcripts under transcripts/YYYY-MM-DD/ and update the index
6. Spawn one processing subagent per video (parallel)
7. Write yt-analysis-YYYY-MM-DD-HHMMSS.md with all results
```

Processing modes:

- **summary** — proportional digest (5–20% of transcript length), optional focus (technical / business / general)
- **news** — domain-specific novelty extraction (AI/ML, Frontend/Web, Backend/DevOps), optional narrowing to open-source or practical only
- **custom** — your own prompt applied to each transcript

## Requirements

Install these on your machine before using the plugin:

| Tool | Install | Why |
|---|---|---|
| **Node.js ≥ 20** | [nodejs.org](https://nodejs.org) | Runs the bundled transcription script |
| **yt-dlp** | `brew install yt-dlp` | Downloads audio from YouTube |
| **ffmpeg** | `brew install ffmpeg` | yt-dlp needs it for audio extraction |
| **`ELEVENLABS_API_KEY`** | [ElevenLabs API keys](https://elevenlabs.io/app/settings/api-keys) | Transcription API credential |

Set the API key in your shell profile (`~/.zshrc` / `~/.bashrc`):

```bash
export ELEVENLABS_API_KEY="sk_..."
```

No `pnpm install` or `node_modules` setup needed — the plugin ships a prebuilt transcription bundle.

## Installation

```
/plugin install yt@cc-toolkit
```

## Output

For each run the plugin writes two artifacts into your current project:

- `transcripts/YYYY-MM-DD/<Video_Title>.md` — raw transcript, reused by future runs
- `yt-analysis-YYYY-MM-DD-HHMMSS.md` — combined report with TOC, per-video sections, and a transcript index

The `transcripts/index.json` file deduplicates across runs — re-asking about a video you've already transcribed skips the ElevenLabs call entirely.

## Gotchas

- **Playlist URLs are blocked by default** — `yt-transcribe` refuses to expand them so you don't accidentally transcribe 200 videos. Pass individual video URLs.
- **Age-restricted / private videos** — `yt-dlp` may need `--cookies-from-browser chrome`. The skill surfaces the error and suggests the fix.
- **Polish diacritics** — filenames are transliterated (`zarządzać` → `zarzadzac`) for shell safety, but transcript content preserves diacritics.
- **Sequential transcription** — ElevenLabs is called one video at a time to stay under rate limits. Multi-video pipelines parallelize *processing*, not transcription.

## Development

The transcription script lives in `tools/transcript_audio/` and is bundled with [tsdown](https://tsdown.dev/) (rolldown) into `scripts/transcript_audio/`. To rebuild:

```bash
./plugins/yt/scripts/build-bundles.sh
```

Commit the regenerated bundles before cutting a release. See `CHANGELOG.md` for the release log.

## License

MIT — part of [cc-toolkit](https://github.com/grixu/cc-toolkit).

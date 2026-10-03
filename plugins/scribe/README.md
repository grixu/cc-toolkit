# scribe

scribe turns YouTube videos and local recordings into text, then into the summary, news digest or notes you ask for. It saves each transcript and reuses it on later runs, so you pay for transcription once per video or file.

Transcription uses ElevenLabs Scribe, a paid API. `yt-dlp` downloads YouTube audio, and `ffmpeg` extracts audio from video files.

Language: scribe talks to you and asks its questions in Polish. Summaries and notes follow the language of your request, and fall back to Polish when it is unclear. Transcripts keep the spoken language.

## Install

scribe is a Claude Code plugin. Add the `cc-toolkit` marketplace once, then install the plugin:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install scribe@cc-toolkit
```

## Requirements

| Tool | Install | Needed for |
|---|---|---|
| Node.js 20 or later | [nodejs.org](https://nodejs.org) | Both sources; runs the bundled transcription script |
| `ELEVENLABS_API_KEY` | [ElevenLabs API keys](https://elevenlabs.io/app/settings/api-keys) | Both sources |
| ffmpeg, which includes ffprobe | `brew install ffmpeg` | Both sources |
| yt-dlp | `brew install yt-dlp` | YouTube |
| `shasum` | preinstalled on macOS | Local files; computes the cache key |

Set the API key in your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export ELEVENLABS_API_KEY="sk_..."
```

The transcription script ships prebuilt, so there is nothing to install with a package manager.

## Quick start

```
/scribe:yt Podsumuj ten film https://www.youtube.com/watch?v=abc123
/scribe:local Wyciągnij action items z ~/Recordings/standup.m4a
/scribe:local Transcribe everything in ~/Recordings/
```

You can also paste links or paths with a request in plain words ("summarize these videos", "podsumuj nagranie"), and Claude picks the matching skill.

A run goes like this:

1. It checks the cache. When some items already have transcripts, it asks whether to reuse them.
2. It transcribes the new items in the background, one at a time.
3. Meanwhile it asks how to process them: a summary with an optional focus, news from a field you choose, or your own prompt.
4. It processes every transcript in parallel, writes one report, and prints the results in chat.

## Skills

Start with one of these two:

| Skill | Use it for | Example |
|---|---|---|
| `yt` | One or more YouTube videos, end to end | `/scribe:yt co nowego w AI w tych odcinkach <url> <url>` |
| `local` | Audio or video files on disk, end to end | `/scribe:local podsumuj ~/Recordings/*.mp4` |

The single-stage skills run one step only:

| Skill | Does | Leaves |
|---|---|---|
| `yt-transcribe` | Downloads and transcribes YouTube audio | Markdown transcripts in a `/tmp/yt-audio-*` directory |
| `local-transcribe` | Transcribes local files | Markdown transcripts in a `/tmp/scribe-local-*` directory |
| `transcript-process` | Runs a summary, news extraction or your prompt on an existing transcript | The result in chat |

Only `yt` and `local` save transcripts to `transcripts/` and reuse them on later runs.

## Inputs

`yt` accepts `watch?v=`, `youtu.be/` and `shorts/` links.

- For a link that also names a playlist, it fetches only that video.
- For a playlist link, it stops and asks which videos you want.
- It skips live streams with a warning.

`local` accepts:

| Input | Example |
|---|---|
| A file | `~/Recordings/meeting.mp4` |
| A glob | `~/Recordings/*.m4a`, `~/projects/**/audio/*.mp3` |
| A folder | `~/Recordings/`, direct children only; use `**` to go deeper |

Folders and globs pick up these extensions:

- Audio, sent to ElevenLabs as is: `mp3 m4a wav ogg flac opus aac`
- Video, converted to mp3 with ffmpeg first: `mp4 mov mkv webm avi m4v wmv ts flv 3gp amr wma`

A file you name explicitly goes to ffmpeg even when its extension is not on these lists. scribe never moves or changes your source files.

When one message holds both YouTube links and local paths, scribe handles them in two runs, one after the other, and writes two reports.

## Output

Everything goes into the directory you run Claude Code in:

```
transcripts/
  index.json                         YouTube cache, keyed by URL
  local-index.json                   local-file cache, keyed by SHA-256 of the file content
  2026-10-02/Safe_Title.md           raw transcripts, with ASCII file names
yt-analysis-2026-10-02-101500.md     one report per yt run
local-analysis-2026-10-02-101500.md  one report per local run
```

Each report has a table of contents, one section per video or file, links to the transcripts it used, and a list of failures. Transcripts label speakers `Mówca 0`, `Mówca 1` when more than one person speaks, and mark sounds such as `[laughter]`.

The local cache follows file content: a moved or renamed file is still a cache hit, and an edited or re-encoded file is transcribed again.

## Cost and limits

- ElevenLabs bills per transcription; the skills estimate about $0.30 per hour of audio.
- `local` asks before it transcribes more than 5 files. `yt-transcribe` asks before 5 or more videos.
- Items are transcribed one at a time to stay under ElevenLabs rate limits. Processing runs in parallel.
- The bundled script rejects files over 1 GB. The skills warn above 750 MB and, for local files, above 3 hours.

## Troubleshooting

- Age-restricted, private or members-only video: `yt-dlp` needs your logged-in browser session. The skill suggests `--cookies-from-browser chrome`, or your browser.
- Geo-blocked video: reported as an error; the skill has no workaround.
- `ffmpeg` missing: `local` stops and tells you to install it.

## Upgrading from `yt`

This plugin used to be called `yt`. Run `/plugin uninstall yt`, then install `scribe` as above. Existing `transcripts/` folders and `index.json` keep working as the cache. The `yt-process` skill is now `transcript-process`, with no alias.

Contributors: the transcription script's source lives in `tools/transcript_audio/`; rebuild the bundle with `scripts/build-bundles.sh`.

## License

MIT, part of [cc-toolkit](https://github.com/grixu/cc-toolkit).

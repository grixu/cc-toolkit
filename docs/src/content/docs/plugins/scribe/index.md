---
title: scribe
description: Transcribes YouTube videos and local audio or video files, then summarizes them, extracts news, or applies your own prompt.
---

scribe turns YouTube videos and local recordings into text, then into the summary, news digest, or notes you ask for.
It saves each transcript and reuses it on later runs, so you pay for transcription once per video or file.
This plugin was formerly called `yt`.

## Install

```
/plugin install scribe@cc-toolkit
```

It also needs:

- Node.js 20 or later
- `ffmpeg`
- `ELEVENLABS_API_KEY` set in your shell, for the paid ElevenLabs Scribe API
- `yt-dlp`, for YouTube videos only

scribe talks to you and asks its questions in Polish.
Summaries and notes follow the language of your request, and fall back to Polish when it's unclear.

## What it does

| Command or skill | What it does |
|---|---|
| `/scribe:yt` | Transcribes and processes one or more YouTube videos end to end. Starts on its own when you paste YouTube links with a request such as "summarize these videos." |
| `/scribe:local` | Transcribes and processes audio or video files on disk end to end. Accepts a file, a glob, or a folder. Starts on its own when you give file paths with a request. |
| `/scribe:yt-transcribe` | Downloads and transcribes YouTube audio only, without processing. |
| `/scribe:local-transcribe` | Transcribes local files only, without processing. |
| `/scribe:transcript-process` | Runs a summary, news extraction, or your own prompt on an existing transcript. |

Only `yt` and `local` save transcripts to `transcripts/` and reuse them on later runs.
They also write one report per run, such as `yt-analysis-<date>-<time>.md`, in the directory where you run Claude Code.

## Usage

- Paste a YouTube link and ask for a summary. scribe checks the cache, transcribes new videos, and asks how to process them.
- Run `/scribe:local Transcribe everything in ~/Recordings/`. It picks up audio and video files that are direct children of the folder.
- Run `/scribe:yt` with several links and ask what's new in a field. It extracts news from that field for each video.
- Ask again about a video you already transcribed. scribe asks whether to reuse the cached transcript.

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/scribe/README.md) has every option.

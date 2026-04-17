---
name: yt
description: "Orchestrate YouTube video analysis pipeline — transcribe and then process videos (summarize, extract domain news, or apply custom prompts). Use whenever user provides YouTube URLs and wants to extract information from them: summaries, news, novelties, key points, analysis, or custom processing. Triggers on: YouTube links + any analysis intent, 'co nowego w tych filmach', 'podsumuj filmy', 'summarize these videos', 'extract info from YT', 'what's new in AI from these episodes', 'przeanalizuj te filmy', or any request combining YouTube URLs with content extraction. Always use this — not yt-transcribe or yt-process separately — when the user wants end-to-end YouTube video analysis."
---

# yt — YouTube Video Analysis Pipeline

Orchestrate the full pipeline: check the transcript index for cache hits, transcribe any new URLs in background, gather user preferences, then process all transcriptions in parallel.

## Sub-skills

| Skill | Path | Purpose |
|---|---|---|
| yt-transcribe | `${CLAUDE_PLUGIN_ROOT}/skills/yt-transcribe/SKILL.md` | Download audio + transcribe to Markdown |
| yt-process | `${CLAUDE_PLUGIN_ROOT}/skills/yt-process/SKILL.md` | Process transcriptions (summary / news / custom) |

## Transcript index

`transcripts/index.json` tracks every video we've already transcribed. Shape:

```json
{
  "videos": [
    {
      "url": "https://www.youtube.com/watch?v=abc123",
      "title": "Original title — may include Polish diacritics",
      "transcript_path": "transcripts/2026-04-17/Safe_Title.md",
      "transcribed_at": "2026-04-17T10:30:00Z"
    }
  ]
}
```

- Deduplication key is `url` — one entry per URL.
- Never write an entry if the transcript file doesn't actually exist on disk.
- `yt-reanalyze` reads this file to offer past videos to the user — treat it as shared state.

## Step 1 — Extract URLs

Parse all YouTube URLs from the user's message. Any format: `watch?v=`, `youtu.be/`, `shorts/`, etc.

No URLs found? Ask the user to provide them before continuing.

## Step 2 — Check the index for cache hits

Load `transcripts/index.json` if it exists. For each extracted URL:

- Is there a matching entry AND does its `transcript_path` still exist on disk? → **cached**
- Otherwise → **fresh** (needs transcription)

If any URLs are cached, ask the user whether to reuse:

```
AskUserQuestion({
  questions: [{
    question: "Mam już transkrypcje dla N z M filmów. Co zrobić?",
    header: "Cache",
    multiSelect: false,
    options: [
      {
        label: "Użyj istniejących (Recommended)",
        description: "Zero pobierania i opłat za Scribe — analiza rusza od razu na istniejących transkrypcjach"
      },
      {
        label: "Pobierz na nowo",
        description: "Zignoruj cache i pobierz wszystko od początku (przydatne gdy transkrypcja była kiepska)"
      }
    ]
  }]
})
```

- "Użyj istniejących" → keep cached URLs as cached, the rest go to `fresh`
- "Pobierz na nowo" → move all cached URLs into `fresh`

List the cached titles (e.g. `• Jak zarządzać firmą`) under the question so the user can see what's already on disk.

If ALL URLs are cached and the user chose "Użyj istniejących", skip Step 3 entirely — no transcription needed.

## Step 3 — Launch transcription in background (only for fresh URLs)

Skip this step if `fresh` is empty.

Read `${CLAUDE_PLUGIN_ROOT}/skills/yt-transcribe/SKILL.md` and spawn a **single background Agent**:

- Name it `yt-transcriber`
- Set `run_in_background: true` — this runs while you talk to the user
- Include the full yt-transcribe skill instructions in the agent's prompt
- Pass only the `fresh` URLs
- Tell the agent to return a JSON array at the end with `url`, `title`, and either `transcript` or `error`:

```json
[
  { "url": "https://...", "title": "Original Title", "transcript": "/tmp/yt-audio-XXXXXX/Safe_Title.md" },
  { "url": "https://...", "error": "reason" }
]
```

Do NOT wait for this agent now — proceed to Step 4 immediately.

## Step 4 — Ask user preferences

Use **AskUserQuestion** in two sequential calls while transcription runs in background.

### 4a. Mode selection

```
AskUserQuestion({
  questions: [{
    question: "Jak chcesz przetworzyć transkrypcje z filmów?",
    header: "Tryb",
    multiSelect: false,
    options: [
      {
        label: "Podsumowanie",
        description: "Zwięzłe podsumowanie najważniejszych informacji z każdego filmu"
      },
      {
        label: "Nowości",
        description: "Wyciągnięcie nowości, ogłoszeń i trendów z wybranej dziedziny"
      },
      {
        label: "Własny prompt",
        description: "Przetworzenie transkrypcji według Twoich własnych instrukcji"
      }
    ]
  }]
})
```

### 4b. Details (depends on chosen mode)

**If Podsumowanie (summary):**

```
AskUserQuestion({
  questions: [{
    question: "Na czym szczególnie skupić podsumowanie?",
    header: "Fokus",
    multiSelect: false,
    options: [
      {
        label: "Ogólne",
        description: "Pełne podsumowanie bez konkretnego nacisku — wszystkie tematy równo"
      },
      {
        label: "Techniczne",
        description: "Nacisk na szczegóły techniczne, narzędzia, implementacje"
      },
      {
        label: "Biznesowe",
        description: "Nacisk na aspekty biznesowe, strategię, rynek, finanse"
      }
    ]
  }]
})
```

Map the answer to `meta`. If user chose "Other" and typed custom text, use that as `meta`. If "Ogólne", leave `meta` empty.

**If Nowości (news):**

```
AskUserQuestion({
  questions: [
    {
      question: "Z jakiej dziedziny wyciągnąć nowości?",
      header: "Dziedzina",
      multiSelect: false,
      options: [
        {
          label: "AI / ML",
          description: "Sztuczna inteligencja, modele językowe, machine learning"
        },
        {
          label: "Frontend / Web",
          description: "Frameworki frontendowe, CSS, przeglądarki, web platform"
        },
        {
          label: "Backend / DevOps",
          description: "Infrastruktura, chmura, bazy danych, CI/CD, backend"
        }
      ]
    },
    {
      question: "Chcesz zawęzić zakres? (opcjonalne)",
      header: "Zawężenie",
      multiSelect: false,
      options: [
        {
          label: "Bez zawężenia",
          description: "Pokaż wszystkie nowości z wybranej dziedziny"
        },
        {
          label: "Tylko open-source",
          description: "Pomiń zamknięte/komercyjne rozwiązania"
        },
        {
          label: "Tylko praktyczne",
          description: "Tylko rzeczy, które można zastosować od razu"
        }
      ]
    }
  ]
})
```

First answer becomes `topic`, second becomes `meta` (skip if "Bez zawężenia").

**If Własny prompt (custom):**

```
AskUserQuestion({
  questions: [{
    question: "Jaki prompt zastosować do transkrypcji?",
    header: "Prompt",
    multiSelect: false,
    options: [
      {
        label: "Wyciągnij cytaty",
        description: "Znajdź najciekawsze cytaty i kluczowe wypowiedzi"
      },
      {
        label: "Actionable items",
        description: "Wyciągnij konkretne porady i kroki do wdrożenia"
      }
    ]
  }]
})
```

The user will likely choose "Other" and type their custom prompt. Map the answer to `prompt`.

## Step 5 — Wait for transcription

If a `yt-transcriber` agent was spawned and hasn't returned yet, wait for its completion notification.

Parse the JSON array from its response. Separate successes (have `transcript`) from failures (have `error`).

## Step 6 — Archive new transcripts + update index

Transcripts from yt-transcribe live in `/tmp/` and will be cleaned up by the OS. Move them to a permanent location **and** record them in the index.

1. Ensure the archive directory exists:

```bash
mkdir -p transcripts/YYYY-MM-DD
```

Use today's date (e.g., `transcripts/2026-04-17`).

2. For each freshly transcribed item, copy it:

```bash
cp "/tmp/yt-audio-XXXXXX/Safe_Title.md" "transcripts/YYYY-MM-DD/Safe_Title.md"
```

The filename is already transliterated ASCII (handled by yt-transcribe + `transliterate.mjs`). Keep it.

3. Rewrite the transcript paths in your working data from `/tmp/...` to `transcripts/YYYY-MM-DD/...`. Use the archived paths from now on.

4. Update `transcripts/index.json`:

   - If the file doesn't exist, create it with `{ "videos": [] }`.
   - For each fresh item: remove any existing entry with the same `url`, then append:
     ```json
     {
       "url": "<url>",
       "title": "<original title from yt-transcribe output>",
       "transcript_path": "transcripts/YYYY-MM-DD/Safe_Title.md",
       "transcribed_at": "<ISO-8601 UTC timestamp>"
     }
     ```
   - Write the file back. Pretty-print with 2-space indent so it stays git-diff-friendly.

5. Tell the user where new transcripts landed (don't mention cached ones — they already know):

```
Nowe transkrypcje zapisane w transcripts/YYYY-MM-DD/:
- Safe_Title.md
```

## Step 7 — Build processing objects

For each URL that has a transcript (cached OR newly transcribed), combine with user preferences:

| Mode | Fields to set |
|---|---|
| summary | `url`, `transcript`, `mode: "summary"`, `meta` (from focus, optional) |
| news | `url`, `transcript`, `mode: "news"`, `topic` (from domain), `meta` (from narrowing, optional) |
| custom | `url`, `transcript`, `mode: "custom"`, `prompt` (user's prompt text) |

## Step 8 — Process all in parallel

Read `${CLAUDE_PLUGIN_ROOT}/skills/yt-process/SKILL.md` once to get the processing instructions.

Spawn **one Agent per video, ALL in a single message** — that's what makes them run in parallel. Sequential messages would mean sequential execution.

Each agent gets:
1. The full yt-process skill instructions (from the SKILL.md you just read)
2. The specific video's data: URL, transcript path, mode, topic/meta/prompt
3. Instruction to read the transcript file from disk and process it according to the mode
4. Instruction to return ONLY the processed output, no meta-commentary

Name agents distinctly: `yt-process-1`, `yt-process-2`, etc.

Example agent prompt structure:

```
You are a video transcript processor. Follow these instructions exactly:

<paste full yt-process SKILL.md instructions here>

Your task — process this video:
- URL: <url>
- Transcript file: <path> — read this file first
- Mode: <mode>
- Topic: <if news mode>
- Meta: <if provided>
- Prompt: <if custom mode>

Read the transcript, then process it according to the mode instructions above.
Return only the final processed output.
IMPORTANT: When writing in Polish, ALWAYS use proper diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż). Never write ASCII-only Polish — "zarządzanie" not "zarzadzanie", "główny" not "glowny".
```

## Step 9 — Auto-save results

Results always get saved to disk — no confirmation prompt. Filename must be unique per run so a second invocation on the same day doesn't overwrite earlier output.

Filename: `yt-analysis-YYYY-MM-DD-HHMMSS.md` (UTC timestamp, seconds resolution).

Content:
- Title and generation timestamp
- Table of contents linking to per-video sections
- **Transcript index** — list of every transcript used in this run (cached and fresh), with relative paths (`transcripts/YYYY-MM-DD/…`), so the user can jump to the raw transcription
- One section per video with full processed output
- Errors appendix if any transcriptions/processing failed

After writing, also print the results inline in chat — separate sections with `---`, headed by video title or URL — so the user doesn't need to open the file to see them.

Tell the user the path: `Zapisano wyniki w yt-analysis-YYYY-MM-DD-HHMMSS.md`.

## Error handling

| Scenario | Action |
|---|---|
| All transcriptions failed AND no cached hits | Report errors, do not proceed to processing |
| Some transcriptions failed | Process successes + cached, list failures at the end |
| Index file corrupt / unreadable JSON | Treat as empty (`{videos: []}`), warn the user, continue |
| Processing failed for a video | Show other results, note the failure |

## Language

Communicate with the user in Polish. Processing output language follows yt-process rules — defaults to the language used when invoking the skill.

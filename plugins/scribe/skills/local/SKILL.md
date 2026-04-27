---
name: local
description: "Orchestrate local-file transcription pipeline — transcribe audio/video files from disk and process them (summarize, extract domain news, or apply custom prompts). Use whenever the user provides paths, globs, or folders pointing at local audio/video files combined with analysis intent. Triggers on: paths ending with audio/video extensions (mp3, m4a, wav, mp4, mov, mkv, etc.) + 'transkrybuj', 'podsumuj nagranie', 'transcribe these files', 'extract action items', 'co jest w tym nagraniu', 'wyciągnij notatki z meetingów', OR folder/glob paths combined with the same intent keywords. Always use this — not local-transcribe or transcript-process separately — when the user wants end-to-end local file analysis. For YouTube URLs instead, use the `yt` skill."
---

# local — Local File Transcription Pipeline

Orchestrate the full pipeline for local audio/video files: discover inputs (paths, globs, folders), check the local index for cache hits, transcribe new files in background, gather user preferences, then process all transcriptions in parallel.

## Sub-skills

| Skill | Path | Purpose |
|---|---|---|
| local-transcribe | `${CLAUDE_PLUGIN_ROOT}/skills/local-transcribe/SKILL.md` | ffmpeg audio extraction + transcribe to Markdown |
| transcript-process | `${CLAUDE_PLUGIN_ROOT}/skills/transcript-process/SKILL.md` | Process transcriptions (summary / news / custom) — source-agnostic |

## Local transcript index

`transcripts/local-index.json` tracks every local file we've already transcribed. Shape:

```json
{
  "items": [
    {
      "source_hash": "sha256:abc123...",
      "source_path": "/Users/me/Recordings/meeting.mp4",
      "title": "meeting",
      "transcript_path": "transcripts/2026-04-27/meeting.md",
      "transcribed_at": "2026-04-27T10:30:00Z"
    }
  ]
}
```

- Deduplication key is `source_hash` (SHA-256 of source file content) — one entry per content hash.
- Moving or renaming a file does **not** invalidate the cache (hash is content-based).
- Modifying the file (re-encode, edit) **does** invalidate it (different bytes → different hash → cache miss → re-transcribe).
- Never write an entry if the transcript file doesn't actually exist on disk.
- The YouTube orchestrator uses a separate index file (`transcripts/index.json`); the two never share entries.
- The archive directory (`transcripts/YYYY-MM-DD/`) **is** shared across both orchestrators — file collisions are handled by suffixing `_2`, `_3`, etc.

## Step 1 — Extract inputs

Parse all path-like tokens from the user's message. Three input types are accepted:

### 1a. Explicit paths

Tokens starting with `/`, `~/`, `./`, or `../`. Expand `~` with `$HOME`. Resolve relative paths from `pwd`.

### 1b. Globs

If a token contains `*`, expand it via bash:

```bash
shopt -s nullglob globstar
matches=( $pattern )
```

`*` is single-segment, `**` is recursive. If the glob produces zero matches, tell the user and skip.

### 1c. Folders

If a token resolves to a directory (no trailing wildcard), list **only direct children** (depth=1) whose extensions match the whitelist:

**Whitelist:** `.mp3 .m4a .wav .ogg .flac .opus .aac .mp4 .mov .mkv .webm .avi .m4v .wmv .ts .flv .3gp .amr .wma`

For recursive folder traversal, the user must use an explicit `**` glob (e.g. `~/Recordings/**/*.mp4`). Default folder semantics is flat to avoid footguns like accidentally transcribing 200 nested files.

### 1d. Validate

After expansion, deduplicate the path list (a file might be matched by both an explicit path and a glob). Drop:

- Files that don't exist or are unreadable.
- Files with extensions outside the whitelist (only when they came from glob/folder expansion — explicit paths are passed through to `local-transcribe`, which delegates extension handling to ffmpeg).

If after validation the list is empty, ask the user to provide valid paths and stop.

### 1e. Confirmation prompt for large batches

If the final list has **more than 5 files**, ask:

```
AskUserQuestion({
  questions: [{
    question: "Znaleziono N plików. Transkrybować wszystkie?",
    header: "Batch",
    multiSelect: false,
    options: [
      {
        label: "Tak, wszystkie",
        description: "Uruchom transkrypcję dla każdego z N plików (ElevenLabs jest płatny — sprawdź listę)"
      },
      {
        label: "Pokaż mi listę",
        description: "Wypisz wszystkie ścieżki, potem podejmę decyzję"
      }
    ]
  }]
})
```

List the first 10 paths under the question so the user can spot-check.

## Step 2 — Check the index for cache hits

Load `transcripts/local-index.json` if it exists (treat malformed JSON as `{items: []}` and warn the user).

Compute the SHA-256 hash of each input file:

```bash
hash="sha256:$(shasum -a 256 "$path" | awk '{print $1}')"
```

For each file:

- Is there a matching entry by `source_hash` AND does its `transcript_path` still exist on disk? → **cached**
- Otherwise → **fresh** (needs transcription)

If any are cached, ask the user whether to reuse:

```
AskUserQuestion({
  questions: [{
    question: "Mam już transkrypcje dla N z M plików. Co zrobić?",
    header: "Cache",
    multiSelect: false,
    options: [
      {
        label: "Użyj istniejących (Recommended)",
        description: "Zero ponownej transkrypcji — analiza rusza od razu na istniejących transkryptach"
      },
      {
        label: "Pobierz na nowo",
        description: "Zignoruj cache i przetranskrybuj wszystko (przydatne gdy transkrypcja była kiepska)"
      }
    ]
  }]
})
```

- "Użyj istniejących" → keep cached files as cached, the rest go to `fresh`.
- "Pobierz na nowo" → move all cached files into `fresh`.

List the cached titles under the question so the user can see what's already on disk.

If ALL files are cached and the user chose "Użyj istniejących", skip Step 3 entirely.

## Step 3 — Launch transcription in background (only for fresh files)

Skip if `fresh` is empty.

Read `${CLAUDE_PLUGIN_ROOT}/skills/local-transcribe/SKILL.md` and spawn a **single background Agent**:

- Name it `local-transcriber`
- Set `run_in_background: true`
- Include the full local-transcribe skill instructions in the agent's prompt
- Pass only the `fresh` paths (with their pre-computed hashes — the agent will re-hash anyway, but passing both lets the agent verify integrity)
- Tell the agent to return a JSON array with `source_path`, `source_hash`, `title`, and either `transcript` or `error`

Do NOT wait for this agent now — proceed to Step 4 immediately while transcription runs.

## Step 4 — Ask user preferences

Use **AskUserQuestion** in two sequential calls while transcription runs in the background.

### 4a. Mode selection

```
AskUserQuestion({
  questions: [{
    question: "Jak chcesz przetworzyć transkrypcje z plików?",
    header: "Tryb",
    multiSelect: false,
    options: [
      {
        label: "Podsumowanie",
        description: "Zwięzłe podsumowanie najważniejszych informacji z każdego pliku"
      },
      {
        label: "Nowości",
        description: "Wyciągnięcie nowości / kluczowych informacji z wybranego obszaru"
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
        description: "Nacisk na aspekty biznesowe, decyzje, ustalenia, action items"
      }
    ]
  }]
})
```

Map the answer to `meta`. If user chose "Other" and typed custom text, use that as `meta`. If "Ogólne", leave `meta` empty.

**If Nowości (news):**

The local-file domain options are intentionally generic (unlike the YT skill, which is biased toward tech podcasts):

```
AskUserQuestion({
  questions: [
    {
      question: "Z jakiego obszaru wyciągnąć nowości?",
      header: "Obszar",
      multiSelect: false,
      options: [
        {
          label: "Bez kategorii",
          description: "Wszystkie nowości i istotne informacje, bez specjalnego filtra"
        },
        {
          label: "Branża/produkt",
          description: "Nowości związane z konkretną branżą lub produktem (uściślij w 'Other')"
        },
        {
          label: "Tematyczny",
          description: "Nowości wokół konkretnego tematu — wpisz w 'Other'"
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
          description: "Pokaż wszystkie nowości z wybranego obszaru"
        },
        {
          label: "Tylko decyzje/ustalenia",
          description: "Pomiń luźne dyskusje, tylko konkretne decyzje i ustalenia"
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
        label: "Action items",
        description: "Wyciągnij konkretne action itemy i zadania do wdrożenia"
      },
      {
        label: "Decyzje i ustalenia",
        description: "Wypisz wszystkie decyzje podjęte podczas nagrania, z kontekstem"
      },
      {
        label: "Notatki ze spotkania",
        description: "Profesjonalne meeting notes z agendą, uczestnikami, decyzjami, action items"
      }
    ]
  }]
})
```

The user will likely choose "Other" and type their custom prompt. Map the answer to `prompt`.

## Step 5 — Wait for transcription

If a `local-transcriber` agent was spawned and hasn't returned yet, wait for its completion notification.

Parse the JSON array from its response. Separate successes (have `transcript`) from failures (have `error`).

## Step 6 — Archive new transcripts + update index

Transcripts from local-transcribe live in `/tmp/` and will be cleaned up by the OS. Move them to a permanent location **and** record them in the index.

1. Ensure the archive directory exists:

```bash
mkdir -p transcripts/YYYY-MM-DD
```

Use today's date (e.g., `transcripts/2026-04-27`).

2. For each freshly transcribed item, copy with collision handling:

```bash
TARGET="transcripts/YYYY-MM-DD/<safe_stem>.md"
SUFFIX=2
while [[ -e "$TARGET" ]]; do
  TARGET="transcripts/YYYY-MM-DD/<safe_stem>_$SUFFIX.md"
  ((SUFFIX++))
done
cp "$TMP_TRANSCRIPT" "$TARGET"
```

The collision suffix protects against multiple files sharing the same transliterated stem (e.g. two recordings both named `meeting`). The hash in the index is the actual identity, so renamed files don't break anything.

3. Rewrite the transcript paths in your working data from `/tmp/...` to `transcripts/YYYY-MM-DD/...`. Use the archived paths from now on.

4. Update `transcripts/local-index.json`:

   - If the file doesn't exist, create it with `{ "items": [] }`.
   - For each fresh item: remove any existing entry with the same `source_hash`, then append:
     ```json
     {
       "source_hash": "sha256:...",
       "source_path": "/Users/.../<original path>",
       "title": "<original filename stem>",
       "transcript_path": "transcripts/YYYY-MM-DD/<safe_stem>.md",
       "transcribed_at": "<ISO-8601 UTC timestamp>"
     }
     ```
   - Write the file back. Pretty-print with 2-space indent so it stays git-diff-friendly.

5. Tell the user where new transcripts landed (don't mention cached ones — they already know):

```
Nowe transkrypcje zapisane w transcripts/YYYY-MM-DD/:
- meeting.md
- voice_memo.md
```

## Step 7 — Build processing objects

For each file that has a transcript (cached OR newly transcribed), combine with user preferences:

| Mode | Fields to set |
|---|---|
| summary | `url` (= source_path for context), `transcript`, `mode: "summary"`, `meta` (from focus, optional) |
| news | `url` (= source_path), `transcript`, `mode: "news"`, `topic` (from area), `meta` (from narrowing, optional) |
| custom | `url` (= source_path), `transcript`, `mode: "custom"`, `prompt` (user's prompt text) |

The `transcript-process` skill expects a `url` field for context — pass the source file path there. The label "url" is a historical name; the field accepts any source identifier.

## Step 8 — Process all in parallel

Read `${CLAUDE_PLUGIN_ROOT}/skills/transcript-process/SKILL.md` once to get the processing instructions.

Spawn **one Agent per file, ALL in a single message** — that's what makes them run in parallel. Sequential messages would mean sequential execution.

Each agent gets:
1. The full transcript-process skill instructions (from the SKILL.md you just read)
2. The specific file's data: source path, transcript path, mode, topic/meta/prompt
3. Instruction to read the transcript file from disk and process it according to the mode
4. Instruction to return ONLY the processed output, no meta-commentary

Name agents distinctly: `local-process-1`, `local-process-2`, etc.

Example agent prompt structure:

```
You are an audio/video transcript processor. Follow these instructions exactly:

<paste full transcript-process SKILL.md instructions here>

Your task — process this file:
- Source: <source_path>
- Transcript file: <path> — read this file first
- Mode: <mode>
- Topic: <if news mode>
- Meta: <if provided>
- Prompt: <if custom mode>

Read the transcript, then process it according to the mode instructions above.
Return only the final processed output.
IMPORTANT: When writing in Polish, ALWAYS use proper diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż). Never write ASCII-only Polish.
```

## Step 9 — Auto-save results

Results always get saved to disk — no confirmation prompt. Filename must be unique per run so a second invocation on the same day doesn't overwrite earlier output.

Filename: `local-analysis-YYYY-MM-DD-HHMMSS.md` (UTC timestamp, seconds resolution).

Content:
- Title and generation timestamp
- Table of contents linking to per-file sections
- **Transcript index** — list of every transcript used in this run (cached and fresh), with relative paths (`transcripts/YYYY-MM-DD/…`), so the user can jump to the raw transcription
- One section per file with full processed output (header = file title)
- Errors appendix if any transcriptions/processing failed

After writing, also print the results inline in chat — separate sections with `---`, headed by file title or source path — so the user doesn't need to open the file to see them.

Tell the user the path: `Zapisano wyniki w local-analysis-YYYY-MM-DD-HHMMSS.md`.

## Error handling

| Scenario | Action |
|---|---|
| All transcriptions failed AND no cached hits | Report errors, do not proceed to processing |
| Some transcriptions failed | Process successes + cached, list failures at the end |
| Index file corrupt / unreadable JSON | Treat as empty (`{items: []}`), warn the user, continue |
| Processing failed for a file | Show other results, note the failure |
| User-specified path doesn't exist | Drop from list with warning, continue with the rest |
| Glob produces zero matches | Drop pattern with warning, continue with the rest |
| ffmpeg missing | Stop — `local-transcribe` will fail. Tell the user to `brew install ffmpeg` |

## Mixed input (URL + local path in the same message)

If the user's message contains both local file paths and **YouTube URLs**, finish your full pipeline first (Steps 1-9: discover + transcribe + process + write `local-analysis-*.md`). Only the local paths are handled in your run; URLs are deferred.

After Step 9 completes, **sequentially** spawn the `yt` orchestrator as a sub-Agent for the leftover URLs:

```
Wykryto też N URL-i YouTube w wiadomości — odpalam orkiestrator `yt` dla nich...

Agent({
  description: "Process leftover YouTube URLs",
  prompt: "<full yt SKILL.md instructions>\n\nProcess these URLs: <list>"
})
```

The spawned `yt` orchestrator runs its own complete pipeline and writes its own `yt-analysis-*.md`. The user gets two separate, independent reports — one per source.

**Detection rule:** any token matching `https?://(www\.)?(youtube\.com|youtu\.be)/...` or `https?://(www\.)?youtube\.com/(watch|shorts|playlist|live)/...`.

If detection is ambiguous, prefer to skip — better miss-trigger than false-trigger.

## Language

Communicate with the user in Polish. Processing output language follows transcript-process rules — defaults to the language used when invoking the skill.

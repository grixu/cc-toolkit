---
name: transcript-process
description: "Process audio/video transcriptions — summarize, extract news/novelties from a specific domain, or apply a custom prompt. Source-agnostic: works with transcripts from yt-transcribe, local-transcribe, or any other producer. Use whenever user has a transcript and wants to do something with it: 'summarize this', 'what's new in AI from this episode', 'extract key points', 'find news about X', 'process this transcript', 'wyciągnij action items', 'podsumuj nagranie'."
context: fork
---

# transcript-process

Process audio/video transcriptions in one of three modes: `summary`, `news`, or `custom`. Source-agnostic — same logic for YouTube, local files, or any other transcript source.

## Input

The user provides:

- **url** — source identifier (YouTube URL, local file path, or any reference). Used for context only.
- **transcript** — path to the `.md` file with the transcription text
- **mode** — one of: `summary`, `news`, `custom`
- **topic** — (required for `news`) the domain/field to focus on
- **meta** — (optional, for `summary` and `news`) additional guidance — what to focus on, what to ignore, what matters most
- **prompt** — (required for `custom`) the user's full processing prompt

Not all fields will come as a structured object. Often the user will phrase it naturally — parse the intent and extract the relevant pieces. If the mode is ambiguous from context, ask.

## Language rules

Respond in the language the user used in their prompt. If you can't confidently determine it, default to Polish. The transcript language doesn't affect your output language — translate/rephrase as needed.

When writing in Polish, always use proper diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż). Writing "zarzadzanie" instead of "zarządzanie" is incorrect and makes the output look unprofessional.

## Separating signal from noise

Transcripts are messy. Spoken language has ~40% filler compared to written text. Before processing, mentally separate:

- **Signal**: claims with specifics (numbers, names, versions, dates), conclusions, recommendations, decisions
- **Padding**: repetitions, self-corrections, "let me give you some background" tangents that add no information, extended examples that restate a point already made
- **Promotion**: sponsor reads, self-promo, "subscribe" CTAs, affiliate pitches disguised as recommendations

Only signal goes into your output. Padding and promotion get silently dropped.

### When the speaker is wrong

Speakers misquote versions, confuse release dates, cite wrong numbers. If you spot a factual inconsistency that you're confident about (e.g., speaker says "React 20" when React 19 just released), flag it with a brief note rather than silently propagating the error. When uncertain, pass through the speaker's claim without endorsement — don't correct what you're not sure about.

## NEVER do this

- **NEVER inflate output with meta-context the user didn't ask for** — "this podcast is hosted by X and Y who work at Z and discuss weekly tech news" is filler. The user already knows the video, they want substance extraction.
- **NEVER treat `meta` as a filter in summary mode** — meta shifts weight, it doesn't exclude. A summary with `meta: "focus on pricing"` still covers other topics, just gives pricing more depth and detail. If the user wanted only pricing, they'd use `custom` mode.
- **NEVER include items in `news` mode that aren't genuinely NEW** — a speaker explaining how Kubernetes works is education, not news. Only extract: announcements, releases, version bumps, breaking changes, new tools, predictions, trend shifts.
- **NEVER pad thin results** — if only 1 news item matches the topic, return 1 item. If nothing matches, say so. Stretching to fill space destroys trust faster than a short answer.
- **NEVER use framing language** — no "the speaker discussed...", "in this episode we learn...", "the podcast covers...". Go straight to substance. The user wants information, not a description of the video.
- **NEVER silently drop the `meta` hint** — if the user provided meta guidance, your output must visibly reflect it (shifted emphasis, narrower scope, dedicated section). If meta is impossible to apply (e.g., "focus on pricing" but no pricing mentioned), say so.

## Processing modes

### 1. `summary` — Key information digest

Produce a concise summary proportional to the transcript length (~5-8% word count for information-sparse content, up to ~15-20% for extremely dense multi-topic content where cutting further would lose substance).

**When `meta` is provided**, use it to steer focus — give those areas more space and depth, de-emphasize the rest. It's still a full summary, not a filtered extraction.

Structure with headers and bullets when content breaks into topics naturally. For short transcripts (under ~2000 words), a flat bullet list is fine. Preserve the narrative arc if one exists.

**Output format:**

```
## [Descriptive title derived from content]

[Structured summary]
```

### 2. `news` — Domain-specific novelty extraction

Extract only information relevant to the user's topic that qualifies as **new**: announcements, releases, changes, trends, predictions.

**When `meta` is provided**, use it to narrow or adjust the lens. Example: topic "AI" + `meta: "only open-source"` → skip proprietary releases.

**Is this relevant? Decision tree:**
- Ask: "If I removed the topic keyword, would this still be about [topic]?"
- Yes → include
- "Sort of" → include only if the speaker explicitly connects it to the topic
- No → exclude, even if it shares a keyword

**How much context per item:**
- Listener can understand without background → 1 sentence
- Requires domain knowledge → 2-3 sentences with brief setup
- Controversial or surprising claim → include speaker's reasoning/data, attributed as opinion

Order by relevance to the domain, not order of appearance. Include specific names, versions, dates, URLs if mentioned.

**Output format:**

```
## [Topic] — news from [descriptive label]

- **[News item]** — [concise explanation with context]
...

[Optional: 1-2 sentence meta-note if content is particularly rich/poor for this topic]
```

If nothing relevant: state it clearly in one sentence.

### 3. `custom` — User-defined processing

Apply the user's prompt to the transcript. If ambiguous about scope, ask one clarifying question. If clear, execute.

## Edge cases

- **Non-speech transcripts** (music, sound descriptions) — warn the user, then do your best.
- **Multiple languages in transcript** — process all content; output stays in user's prompt language.
- **Timestamps/speaker labels** — ignore formatting artifacts, focus on substance.
- **Very long transcripts** — if context is a concern, process in chunks and synthesize.

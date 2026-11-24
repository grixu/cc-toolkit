# fast-jev-compaction

fast-jev-compaction replaces Claude Code's compaction summary with the original conversation, minus the tool calls and tool outputs a decision model judges Claude no longer needs. Everything it keeps stays word for word; user and assistant text is never rewritten. When it cannot remove enough, Claude Code's own summary runs as usual.

Ported from [tamaratran/fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) 0.3.0 (MIT, see `LICENSE`). This copy adds Gemini Decision as a backend and reads every key from the environment as well as from the plugin options.

## Install

```
/plugin marketplace add grixu/cc-toolkit
/plugin install fast-jev-compaction@cc-toolkit
```

If you installed the upstream plugin (`fast-jev-compaction@fast-jev-compaction`), uninstall it, or both hooks compact the same session.

## Requirements

A key for one of the two backends:

- TypeSafe's Jev: `TYPESAFE_API_KEY` in the environment, or the `apiKey` option.
- Google's Gemini Decision (`gemini-decision-1`): a Gemini Developer API key with access to the Decisions API, in `GEMINI_DECISIONS_API_KEY` or `GEMINI_API_KEY`, or the `geminiApiKey` option.

With neither, every compaction falls back to Claude Code's summary.

## Options

Every option may stay empty or at its default. Keys set as options are stored as secrets.

| Option | Default | What it does |
|---|---|---|
| `backend` | `auto` | `auto` uses TypeSafe when its key is set, otherwise Gemini; `typesafe` or `gemini` uses that one only. |
| `apiKey` | none | TypeSafe API key. Empty reads `TYPESAFE_API_KEY`, then `env.TYPESAFE_API_KEY` in Claude Code's settings. |
| `geminiApiKey` | none | Gemini API key. Empty reads `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`. |
| `keepThreshold` | `0.5` | Minimum probability that a call or its output is still needed; below it the item goes. |
| `preserveRecentMessages` | `6` | Newest messages never touched. The first message is always kept too. |
| `compactAtPercent` | `60` | Context usage at which the end of a turn requests a compaction. |
| `minReductionRatio` | `0.25` | Minimum share of characters a compaction must remove; below it Claude Code's summary runs instead. |
| `maxStateTokens` | `25000` | Estimated token budget for the conversation sent with every request. |
| `maxRequestTokens` | `30000` | Estimated token budget for the conversation plus one batch of questions. |
| `truncateHeadChars` | `300` | Characters kept from a tool output that is dropped; `0` keeps only the note. |
| `model` | `jev-latest` | Jev model on TypeSafe. Gemini always uses `gemini-decision-1`. |

## How it works

The plugin hooks `session.compact` and `turn.complete`. At the end of a turn whose context usage has reached `compactAtPercent`, it asks Claude Code to compact; `/compact` and auto-compaction go the same way.

1. Every tool call is paired with its output. Calls in the first message or in the newest `preserveRecentMessages` messages are pinned and never touched.
2. The model is sent the whole conversation so far, oldest first, with each tool output replaced by a short note (`ok, 4213 chars (omitted)`). Nothing is summarized.
3. That conversation is fitted into `maxStateTokens` in stages, each only when the one before was not enough: tool inputs truncated, long texts abridged oldest first, old messages collapsed to a note, old tool calls reduced to one line each, old call-less messages left out. If it still does not fit, the compaction falls back.
4. For every call that is not pinned, the model answers two yes/no questions: should the call stay, and should its full output stay.
5. The questions are split across as many requests as `maxRequestTokens` needs, each with the same conversation; they run at once.
6. Per call: when the output should stay, both stay; when only the call should, the output is cut to `truncateHeadChars` plus a note; otherwise the call and its output go.
7. The message list is rebuilt. Untouched messages keep their identity, and no output is ever left without its call.

A failed or malformed answer, a missing key, a conversation that cannot be fitted, or a reduction under `minReductionRatio` falls back to Claude Code's summary. Each outcome shows as a toast, and a `decisions:` log line lists every call with both probabilities.

## Privacy

Each compaction sends the conversation (tool outputs replaced by notes) to the backend whose key is in use: TypeSafe or Google.

## Limitations

- Only tool calls and outputs are removed; text messages are only abridged in what the model reads.
- Token counts are estimated from characters, not counted by a tokenizer.
- A probability is not proof that an output is safe to drop. Claude can always run the tool again.
- The full conversation is resent with every request, so a long history costs one request per handful of questions.

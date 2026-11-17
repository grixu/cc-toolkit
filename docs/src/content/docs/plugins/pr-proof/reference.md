---
title: Reference
description: The commands, the options, the proof_signals tool's input and output, the proof manifest's format, and the files pr-proof writes.
group: reference
sidebar:
  order: 6
---

## Commands

```
/pr-proof:prepare-proof [base] [before]
/pr-proof:screenshot-proof [urls] [credentials] [files] [base] [before]
/pr-proof:terminal-proof terminal|api [urls] [credentials] [files] [base]
/pr-proof:walkthrough-video [feature, spec path or PR] [who watches and what they asked to see] [record-only]
```

| Argument | Means | Default |
|---|---|---|
| `base` | the branch the change merges into | the repository's default branch |
| `before` | also take "before" screenshots of the base | no before shots |
| `urls` | the running app's URL; with `before`, also a base stack's URL | asked for when missing |
| `credentials` | where the test users' credentials live, as a path or a source, never a value | asked for when missing |
| `files` | the diff's files the proof covers | picked from the diff |
| `terminal` or `api` | the transcript mode, and the manifest kind it writes | required |
| `record-only` | report the accepted video's path to the caller, instead of copying it to `~/Downloads/` and attaching it | standalone delivery |

Table 1. The arguments. `prepare-proof` passes `urls`, `credentials`, `files` and `base` to the skills it runs.

Every skill refuses on the default branch or a detached HEAD, except `walkthrough-video`.

## Options

pr-proof asks for these when you enable the plugin, and you can change them in `/config`.
Every one may stay empty.

| Option | Default | What it does |
|---|---|---|
| `typesafe_api_key` | none | TypeSafe API key for `proof_signals`, stored as a secret. Empty falls back to the `TYPESAFE_API_KEY` environment variable. |
| `typesafe_endpoint` | `https://api.typesafe.ai` | Base URL of the TypeSafe API. |
| `typesafe_model` | `jev-1.14.0` | Jev model name or alias, such as `jev-latest`. |
| `gemini_api_key` | none | Gemini Developer API key for Gemini Decision (`gemini-decision-1`), stored as a secret. Empty falls back to `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`. |
| `decision_backend` | `auto` | `auto` uses the backend whose key is set, and with both keys `prepare-proof` asks you which to use. `typesafe` or `gemini` uses that one. `both` asks both side by side. |
| `primary_backend` | `typesafe` | With both backends, whose signals `prepare-proof` plans from; the other's stand beside them. |
| `screenshot_widths` | none | Comma-separated viewport widths in pixels, such as `375,768,1440`. Empty uses the project's breakpoints, or 375, 768 and 1440 when it has none. |
| `video_speed` | `1x` | How fast `walkthrough-video` plays its video: `0.5x` (the calm pace of the take), `1x` (twice as fast), `2x`, `3x` or `5x` (ten times as fast). The take is always recorded at the calm pace, so a new speed needs only a re-render. |
| `caption_density` | `normal` | How much text one caption holds: `normal` up to 60 characters, `2x` up to 120 and `4x` up to 240, in smaller type (40, 28 and 20 px at 1080p) covering the same area. |

Table 2. The plugin options.

With neither a TypeSafe nor a Gemini key, the `proof_signals` tool isn't registered and nothing leaves the machine.
A `decision_backend` that names a backend without a key makes the tool return `Proof signals unavailable:` with the missing key.

## Tool: `proof_signals`

`mcp__pr-proof__proof_signals` asks a decision model which kinds of proof a change needs.
`prepare-proof` calls it; you don't call it yourself.

### Input

| Field | Required | Means |
|---|---|---|
| `base` | yes | the branch the change merges into, such as `main` |
| `repo` | no | the absolute path of the working tree to judge, such as a git worktree outside the session's directory. `prepare-proof` always passes it. Without it the tool reads the session's directory. A relative path or a directory outside git makes the signals unavailable; it never falls back to another checkout. |
| `backend` | no | `typesafe`, `gemini` or `both`: your answer after a `Backend choice needed` result. It wins over `decision_backend`. |

Table 3. The tool's input.

The tool compares `origin/<base>...HEAD`, or `<base>...HEAD` when origin has no such branch.

### What it sends

- the diffstat of the range;
- the list of changed files and their diff, with documentation sent apart from code;
- no commit messages.

The diffs of lockfiles, minified files, source maps, snapshots, binary files and files under `dist/`, `build/`, `vendor/` and `node_modules/` are left out.
The diffstat still lists them.
A large diff is split into up to eight parts, and a part the model finds too long is halved again; the rest is reported as not assessed.

### Output

The result is JSON:

```json
{
  "backend": "typesafe",
  "model": "jev-1.14.0",
  "signals": {
    "screenshots": { "signal": "suggest", "p": 0.91 },
    "video": { "signal": "uncertain", "p": 0.48 },
    "api": { "signal": "reject", "p": 0.04 },
    "terminal": { "signal": "reject", "p": 0.12 }
  },
  "noBehaviorChange": { "signal": "reject", "p": 0.03 },
  "suppressed": false,
  "coverage": { "parts": 1, "filesNotAssessed": 0, "filesExcluded": 1, "truncatedHunks": 0, "partial": false }
}
```

| Field | Means |
|---|---|
| `backend`, `model` | who answered |
| `signals` | for each kind, the probability `p` that the change calls for it, and its signal: `suggest` at 0.7 or more, `reject` at 0.3 or less, `uncertain` between |
| `noBehaviorChange` | the signal that the change leaves program behavior unchanged |
| `suppressed` | `true` when `noBehaviorChange` is `suggest`; planning any kind against it is an overrule |
| `coverage` | how many parts were sent, how many files weren't assessed or were left out, and how many hunks were cut; `partial` is `true` when anything wasn't assessed |
| `comparison` | with both backends only: one entry per backend, holding its own fields above or its `error` |

Table 4. The fields of a result.

With several parts, a kind takes its highest probability across the parts, and `noBehaviorChange` its lowest.
That way one documentation-only part can't hide the proof another part needs.

With both backends, the top-level fields belong to the primary backend.
When the primary fails and the other answers, they belong to the other one.

Two other results are plain text:

- `Backend choice needed: …` when both keys are set and `decision_backend` is `auto`. Nothing was sent.
- `Proof signals unavailable: <reason>` for any failure, such as a base branch that isn't found, a rejected key or a rate limit.

### The comparison log

With both backends, each call appends one JSON line to `~/.cache/pr-proof/compare.jsonl`:

```json
{ "at": "2026-11-13T10:00:00.000Z", "repo": "shop", "branch": "feat/checkout", "head": "<sha>", "base": "origin/main", "results": [] }
```

`repo` is the repository name from the `origin` remote's URL, as in the manifest's path.
`base` is the ref the diff was taken against, such as `origin/main`, not the branch name you passed.
`results` holds the same entries as `comparison`.
The log never holds the diff.
A log that can't be written never costs you the signals.

## The proof manifest

Every skill that produces proof records it in one JSON file per branch:

```
~/.cache/pr-proof/<repo>/<branch>/manifest.json
```

`<repo>` is the repository name from the `origin` remote's URL, so worktrees of one repository share it, and each `/` in the branch becomes `%2F`.

```jsonc
{
  "version": 1,
  "head": "<full sha at the last write>",
  "base": "main",
  "entries": [
    {
      "kind": "screenshots",
      "claim": "The checkout summary shows the discount line.",
      "head": "<full sha when this entry was produced>",
      "files": ["src/checkout/Summary.tsx"],
      "media": [{ "path": "/abs/screenshots/checkout-375.png", "screen": "Checkout", "width": 375 }]
    },
    {
      "kind": "api",
      "claim": "GET /orders/:id returns the discount.",
      "head": "<full sha when this entry was produced>",
      "files": ["src/orders/routes.ts"],
      "transcript": "/abs/api.txt"
    }
  ]
}
```

| Field | Means |
|---|---|
| `version` | `1`; `pr-open` ignores a manifest with another version and says so |
| `head` | the commit at the last write |
| `base` | the base branch, set by the skill that creates the manifest; later writers keep it |
| `entries[].kind` | `video`, `screenshots`, `terminal` or `api` |
| `entries[].claim` | one sentence: what this proof shows |
| `entries[].head` | the commit the entry was produced at; `pr-open` judges each entry's staleness by it |
| `entries[].files` | the diff's files the proof covers |
| `entries[].media` | images or a video, each with an absolute `path`; screenshots also carry `screen` and `width` |
| `entries[].transcript` | the absolute path of a terminal or API transcript |

Table 5. The manifest's fields. An entry holds either `media` or `transcript`.

A new entry replaces the earlier one of the same kind and keeps the others.
Only produced and approved proof enters the manifest; a failure goes to the skill's report.
An empty `entries` list means "no proof needed", while a missing manifest means pr-proof didn't run.

## Files pr-proof writes

| File or folder | Holds |
|---|---|
| `~/.cache/pr-proof/<repo>/<branch>/manifest.json` | the branch's proof manifest |
| `~/.cache/pr-proof/<repo>/<branch>/screenshots/` | the approved screenshots |
| `~/.cache/pr-proof/<repo>/<branch>/terminal.txt`, `api.txt` | the masked, reviewed transcripts |
| `~/.cache/pr-proof/<repo>/<branch>/base-worktree/` | the base worktree for before shots, removed when you stop its stack |
| `~/.cache/pr-proof/compare.jsonl` | the comparison log, with both backends |
| `~/.cache/walkthrough-video/<repo>/<feature-slug>/` | a walkthrough's work folder, including the video in `out/` |
| `~/Downloads/<ticket-or-PR>-<slug>.mp4` | a standalone walkthrough's delivered copy |

Table 6. Where pr-proof writes. Nothing is written into the repository.

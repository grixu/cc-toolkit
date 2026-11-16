# pr-proof: prepare-proof, Jev signals, per-kind executors, pr-open integration

Adds a `prepare-proof` skill that judges which proof a pull request needs, routes to per-kind skills, and hands the result to `pr-open` through a manifest file.

| | |
|---|---|
| Epic / ticket | None; see section 11 |
| Status | Draft, validated 2026-11-09; gaps G1, G2, G3, G6 and G7 closed 2026-11-10 as D45-D50, re-validated 2026-11-10 (section 12); amended 2026-11-11 with D52-D55 (TEST-3, DOCS-2 descriptions); validated ready 2026-11-11 (section 12, pass 9); G4 closed 2026-11-11 by the phase-2 measurement (D22, API-1, section 12); validated ready 2026-11-12 (section 12, pass 10); validated ready 2026-11-12 (section 12, pass 11); validated ready 2026-11-12 (section 12, pass 12); validated ready 2026-11-12 (section 12, pass 13) |
| Date | 2026-11-09 |
| Repository | `grixu/cc-toolkit` at `e20a572` |

Companion documents: [SPEC.notes.md](SPEC.notes.md) (closing notes of the deciding session) and [SPEC.research/](SPEC.research/) (`prior-conversation.md`, `jev-api.md`, `cc-plugin-platform.md`, `symlink-import-probe.md`, `g6-userconfig-empty-probe.md`, `g5-tool-duration-probe.md`).

## 1. Precedence

No earlier spec or ADR exists for this subject: `docs/specs/` did not exist before this file. The only earlier record is the outline in `SPEC.research/prior-conversation.md`. This spec wins wherever they disagree. Three proposals from it are reversed:

1. `SPEC.research/prior-conversation.md:10`, a `jev.ts` extracted from dev-kit and symlinked into pr-proof: reversed by D11.
2. `SPEC.research/prior-conversation.md:10`, the tool name `proof_plan`: reversed by D33.
3. `SPEC.research/prior-conversation.md:11`, pr-open soft-integrating and writing a `### Proof` section: reversed by D5 and D7.

The rest of that file stands as follows. Lines 5, 7 and 8 are carried forward; line 9 is carried forward except its "pr-open will rather use them", because pr-open only reads the manifest (D5); line 6 is carried forward and widened by D1. Line 12 is a claim, corrected by the probe in `SPEC.research/symlink-import-probe.md:117-121`. Lines 13 to 16 are facts and standing rules.

Decision numbering: `D1`-`D32` are the closing notes' `R1`-`R32`; `D33`-`D42` are the notes' assistant-taken `D1`-`D10`; `D43` and `D44` are the user's answers during validation; `D45`-`D50` close gaps G1, G2, G3, G6 and G7 on 2026-11-10; `D51` closes G5's duration half the same day; `D52` and `D53` are the notes' post-verdict decisions of 2026-11-11 (`R33` and the descriptions item); `D54` and `D55` were proposed while writing TEST-3 and ratified by the user the same day.

## 2. Problem and goal

Today a pull request's proof is one kind only and is attached by hand:

- `pr-proof` 0.1.0 holds one skill, `walkthrough-video`, and has no `userConfig` and no mod (`plugins/pr-proof/.claude-plugin/plugin.json`).
- That skill attaches the video itself under `### Video walkthrough` (`plugins/pr-proof/skills/walkthrough-video/SKILL.md:45`).
- `pr-open` knows no proof: it has no proof section and appends `## Risk` as the last section (`plugins/dev-kit/skills/pr-open/SKILL.md:81`).
- Claude Code documents no optional dependency between plugins and no detection of another plugin from a skill body (`SPEC.research/cc-plugin-platform.md:90,145`).

**Goal:** before a PR opens, one skill decides per kind of proof whether it is worth producing, produces only what the user approves, and `pr-open` alone writes it into the PR body.

Secondary goal that shapes the structure: neither plugin detects the other (D5). The manifest file is the only coupling.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Proof kinds are video, screenshots at several widths, terminal transcript, API calls, and "no proof needed"** | Q1a option b, user's choice. Flips if a new executor adds a kind. |
| D2 | **A PR may get several proofs; each kind is judged separately** | Q1b option a, user's choice. Flips if reviewers want one proof per PR. |
| D3 | **Jev gives signals; prepare-proof decides and may overrule a signal, giving its reason** | Q2 option a, user's choice. Jev quality on diffs is undocumented (RA-8), so flips only on measured reliability. |
| D4 | **prepare-proof judges and routes to `walkthrough-video`, new `screenshot-proof` and new `terminal-proof`; each can also be run by hand** | Q3 option a, user's choice. Flips if the executors stop being independently useful. |
| D5 | **The proof reaches pr-open through a manifest file that pr-open reads when it exists; no plugin detects another** | Q4a option a, user's choice. No optional-dependency form is documented (`SPEC.research/cc-plugin-platform.md:90`); flips if one ships. |
| D6 | **The manifest lives under `~/.cache/pr-proof/<repo>/<branch>/`** | Q4b option a, user's choice. Same survival reason as the walkthrough work dir (`plugins/pr-proof/skills/walkthrough-video/SKILL.md:23`); flips if proofs must cross machines. |
| D7 | **The proof goes in a `## Proof` section just before `## Risk`, also under a repository template** | Q5 option a, user's choice. Flips if the risk section stops being last. |
| D8 | **One `terminal-proof` skill has two modes, terminal and API; API stays a separate kind in the manifest and the PR** | Q6 option a, user's choice. Flips if the two modes stop sharing masking and transcript capture. |
| D9 | **Jev is asked atomic facts about the change; mapping facts to proof kinds lives in code** | Q7 option a, user's choice. Docs recommend narrow independent questions combined in code (`SPEC.research/jev-api.md:68`). |
| D10 | **Without a key or when Jev fails, the skill judges alone from the diff and says in its report that Jev was not used** | Q8 option a, user's choice. Flips if Jev becomes mandatory. |
| D11 | **The Jev client helpers are copied into `plugins/pr-proof/hooks/`; no symlink and no extraction from dev-kit** | Q9 option a, user's choice; cost in RA-1. A symlink fails in `--plugin-dir` and local-path marketplaces (`SPEC.research/symlink-import-probe.md:9-11`). |
| D12 | **One confirmation of the whole plan before generating proofs, showing kinds, reasons and what will run; under an agent caller the question goes back to the caller as in `walkthrough-video`** | Q10 option a, user's choice. Flips if proofs become cheap enough to run unconfirmed. |
| D13 | **The manifest is structured JSON (`head`, `base`, entries with `kind`, `claim`, `media`, `transcript`) and pr-open renders by fields, not by kind** | Q11 option a, user's choice. A new kind then needs no pr-open change. |
| D14 | **A staleness note appears only when commits newer than the manifest touched that proof's files** | Q12 option c, user's choice; cost in RA-3. Flips if file lists prove unreliable. |
| D15 | **Under prepare-proof, `walkthrough-video` only records and the path goes in the manifest; only pr-open writes the body; run by hand it behaves as today** | Q13a option a, user's choice; cost in RA-7. Flips if a video must reach an open PR without pr-open. |
| D16 | **On an existing PR, pr-open replaces `## Proof` the way it replaces `## Risk`** | Q13b option a, user's choice; cost in RA-7. D45 covers the body with no section and the empty manifest. |
| D17 | **Terminal and API transcripts pass a deterministic masking script, then a model review; when in doubt the entry is dropped** | Q14 option a, user's choice; cost in RA-6. Flips if transcripts stop reaching a PR body. |
| D18 | **Screenshot widths come from the project's breakpoints, falling back to 375, 768 and 1440 px, with a `userConfig` override** | Q15a option b with fallback a, user's choice. Flips if a project-independent set proves enough. |
| D19 | **Screenshots show the state after the change; "before" only on request by argument** | Q15b option a, user's choice. Flips if reviewers routinely ask for before shots. |
| D20 | **`screenshot-proof` uses the `agent-browser` CLI when `command -v agent-browser` finds it, else Playwright via `pnpm dlx`** | Q15c option b with fallback a, user's choice; cost in RA-2. Flips if one path covers every machine. |
| D21 | **prepare-proof assigns the diff's files to each entry (field `files`) and the executor confirms them** | Q16 option a, user's choice; cost in RA-3. D14 has no input without it. |
| D22 | **Jev state is the diffstat and the diff in parts, with `commits` sent empty, excluding lockfiles and generated files; a fact counts when it appears in any part** | Q17 option a, user's choice, amended 2026-11-11 by the user's "Accept, amend spec" to `fd3:implement-tasks` Q3 (review-g4-commit-variant), which closes G4; D46 settles the aggregation. Q17's commits fell because on 28 labelled PRs the variant without them won every wording pairing, 96 / 5 / 11 agree / disagree / uncertain at Brier 0.078 against 94 / 7 / 11 at 0.089 with them: commit messages argue for the change, `pr_risk`'s reason too. |
| D23 | **Five yes/no facts: appearance → screenshots; interaction or flow in the UI → video; endpoint response → API; output of a command, script, migration or job → terminal; "the change does not affect program behaviour" suppresses the others and yields no proof** | Q18a option b, user's choice. Flips if measurement shows a fact unusable (D25). |
| D24 | **Thresholds: ≥0.7 suggests, ≤0.3 rejects, between them uncertain and the skill decides** | Q18b option a, user's choice. Matches the documented starting point (`SPEC.research/jev-api.md:76`). |
| D25 | **Before the first release, measure on 20-30 of the user's PRs labelled with the right proof, comparing Jev signals to the skill alone and tuning the questions; no hard gate** | Q19 option a, user's choice; RA-8 is what it observes. Flips if Jev publishes a diff benchmark. |
| D26 | **`## Proof` sits outside the length budget like `## Risk`; each entry is its `claim`, then the video or a screenshot table (row = screen, column = width); only long terminal or API transcripts are collapsed in `<details>`** | Q20 option a as amended by the user. Flips if the section crowds out the review. |
| D27 | **Only produced proofs enter the manifest; a failure goes to the skill's report** | Q21 option a, user's choice; cost in RA-5. Flips if reviewers must see failed attempts. |
| D28 | **Shared rules move to `plugins/pr-proof/references/rules.md`, read through `${CLAUDE_SKILL_DIR}/../../references/`** | Q22 option a, user's choice. Flips if the skills stop sharing rules. |
| D29 | **Two PRs: all of pr-proof first (mod and measurement before the skills, release after the measurement), then pr-open** | Q23 option b, user's choice. Flips if pr-open must ship with the skills. |
| D30 | **A terminal proof is observed behaviour of the changed thing; test results stay in pr-open's Testing line** | Q24 option a, user's choice. Flips if test output becomes a reviewer's proof. |
| D31 | **The user watches and approves both video and screenshots before they count as proof** | Q25, the user's own answer. A privacy check on media; flips only on the user's word. |
| D32 | **When the manifest `head` is not an ancestor of HEAD, the manifest is used with a note that history was rewritten, and the report says so** | Q26 option a, user's choice; cost in RA-4. Flips if rebased branches should re-prove. |
| D33 | **The tool is `mcp__pr-proof__proof_signals`** | Assistant-taken, confirmed with the closing summary. It returns signals, not a plan (D3). |
| D34 | **pr-proof `userConfig` has `typesafe_api_key`, `typesafe_endpoint`, `typesafe_model` with dev-kit's defaults and the `TYPESAFE_API_KEY` env fallback** | Assistant-taken, follows D11. A second plugin needs its own entry or the env var (`SPEC.research/cc-plugin-platform.md:113`). |
| D35 | **A long transcript means more than 20 lines** | Assistant-taken, follows D26. Flips if a real PR shows a better cut. |
| D36 | **Re-running replaces entries of the same kind and keeps the others** | Assistant-taken, follows D2. Flips if a re-run should start clean. |
| D37 | **The branch name in the manifest path is encoded (`/` to a safe character); the manifest has a `version` field** | Assistant-taken, follows D6. A `/` would otherwise nest directories, and two plugins read the format. |
| D38 | **Execution order is terminal/API, screenshots, video** | Assistant-taken, follows D4. Cheapest first; a dead stack is found at prepare-proof's bring-up, before the first executor (D43). |
| D39 | **A screenshot or video the user rejects does not enter the manifest and the skill asks whether to retake** | Assistant-taken, follows D31 and D27. Flips with D31. |
| D40 | **"No proof" writes a manifest with an empty list and pr-open creates no section** | Assistant-taken, follows D1 and D5. An absent manifest then means "not run", distinct from "judged unnecessary". |
| D41 | **Labels and samples of the measurement stay in a git-ignored directory** | Assistant-taken, follows D25. The measured PRs may be private and this repository is public. |
| D42 | **pr-open attaches media with the same `gh ... --attach` and `./file` recipe `walkthrough-video` uses** | Assistant-taken, follows D15. The recipe is already in use (`plugins/pr-proof/skills/walkthrough-video/SKILL.md:46`). |
| D43 | **prepare-proof owns all stack handling; the proof executors take only URLs and where the credentials live, and never start, seed or stop a stack; `walkthrough-video` run by hand stays as today (D15)** | The user's answer during validation, 2026-11-09. Flips if an executor must bring up its own app. |
| D44 | **`screenshot-proof` takes `before` shots from a base stack's URL only; under prepare-proof the user chooses per run, in the plan confirmation, between that URL and a second stack prepare-proof starts from a temporary worktree of `base`; with neither, the after shots go on and the before shots are skipped** | The user's answer during validation, 2026-11-09 ("1 lub 2 - wybór usera"). Flips if one form proves enough. |
| D45 | **On an existing PR, pr-open inserts `## Proof` just before `## Risk` when the body has none and the manifest has entries, and removes the section when the manifest's list is empty** | Closes G1, user's choice, 2026-11-10. The body never contradicts the manifest, as with `## Risk`; cost in RA-7. |
| D46 | **Across diff parts, `no_behavior_change` takes the minimum and the four positive facts the maximum** | Closes G2, user's choice, 2026-11-10. One docs-only part must not suppress proof of a code change; phase 2 observes it. |
| D47 | **`screenshot-proof` and `terminal-proof` run by hand write their own manifest entry and assign its `files` themselves** | Closes G3, user's choice, 2026-11-10. Without it a hand-run proof has no path to the PR (D15 gives one only to video). |
| D48 | **When the manifest holds more than 50 media files, `## Proof` carries the first 50 in manifest order and the rest go to PR comments of at most 50 each, one `gh pr comment <n> --body-file <file> --attach ...` per batch** | Closes G7, user's choice ("w paczkach po 50 jako osobne wpisy"), 2026-11-10. `gh pr comment` takes `--attach` with the same 50-file limit and `./` rewrite (`gh pr comment --help`, gh 2.103.3), so no repeated body edit is needed. |
| D49 | **Each overflow comment starts with the marker `<!-- pr-proof:overflow -->`; on a re-run pr-open deletes the overflow comments it finds with that marker and authored by the viewer, then posts the new ones** | Assistant-taken, follows D48 and D16. Without it a re-run leaves stale media in old comments; deleting only marked comments of the viewer leaves every other comment untouched. Flips if editing in place proves needed. |
| D50 | **A skill treats `${user_config.screenshot_widths}` as unset when the text it receives still starts with `${user_config.`, as well as when it is empty** | Closes G6 by probe, 2026-11-10: on Claude Code 2.1.321 a skill body receives only values saved in `pluginConfigs`; an unset key, with or without a `default`, stays literal (`SPEC.research/g6-userconfig-empty-probe.md`). |
| D51 | **API-1 has no overall deadline; its retry wait runs as `$.process.run(['sleep', <s>])`, not `$.clock.sleep`, and the `tool.call` hook carries a `.catch` that returns the unavailable result, as `pr_risk` does (`plugins/dev-kit/hooks/register.ts:146`)** | Closes G5's duration half by probe, 2026-11-10, Claude Code 2.1.322: a tool spending its time inside `$.process.run` completed at 60, 180, 600 and 1200 s, so the worst case of about 220 s without halving is safe, while halving runs a part's halves in sequence and bounds the call at about 1,760 s, past what was observed; `$.clock.sleep` counts toward the hook's 10 s budget and was cut off at 10 s, and without `.catch` the model reads the cut-off as a missing handler (`SPEC.research/g5-tool-duration-probe.md`). The process-based wait is assistant-taken; flips if `$.clock.sleep` stops counting. |
| D52 | **An eval case for pr-open with a manifest (TEST-3) goes into `plugins/dev-kit/evals/`, in phase 4, landing in the same PR as INTEGRATION-6 and UI-1** | Notes R33, the user's answer during `fd3:split-to-tasks`, 2026-11-11 ("Tak, dopisz do specu"). The promptfoo harness with `cases/` and `gh-stand-in.sh` checks the `## Proof` render without GitHub, where otherwise only section 8's draft-PR rows do; flips if the harness stops covering pr-open. |
| D53 | **DOCS-2 also updates pr-proof's `plugin.json` description and keywords and its marketplace description and tags to cover every proof kind, in phase 3** | Notes section 3a, the user's call in the same 2026-11-11 session; both descriptions name only the video today (`plugins/pr-proof/.claude-plugin/plugin.json:3`, `.claude-plugin/marketplace.json:213`). Flips if the release ships before the new skills. |
| D54 | **TEST-3's fixture manifest is written by `reset-sandbox.sh` at INTEGRATION-1's real path, `$HOME/.cache/pr-proof/pr-open-proof-origin/feat%2Fcheckout-summary/manifest.json`, replacing that one directory on every reset** | The user's answer, 2026-11-11, ratified during build-spec re-entry; follows D52 and INTEGRATION-1 (unchanged), which fixes the path under `$HOME`; the provider's `env` reaches the whole agent process (`plugins/dev-kit/evals/provider.mjs:50`), so overriding `HOME` there would move Claude Code's own config too (inference). Cost accepted: an eval writes one fixture directory outside the repository. |
| D55 | **The gh stand-in emulates `--attach` on `pr create`, `pr edit` and `pr comment` by rewriting each `./<name>` of an attached file to a `user-attachments` URL, expands `{owner}`/`{repo}`, and accepts `DELETE` on a single comment** | The user's answer, 2026-11-11, ratified during build-spec re-entry; follows D52. Without it INTEGRATION-6's re-read finds `./` references and reports a failed upload, and its comment listing and D49 deletion hit "unsupported call" (`plugins/dev-kit/evals/gh-stand-in.sh:131-158,288,303`). |

**Risks accepted.**

| # | Risk | Cost if it lands | Mitigation |
|---|---|---|---|
| RA-1 | The copied Jev client drifts from dev-kit (D11) | A fix in `risk.ts` does not reach pr-proof | The copy is small and listed in INFRA-1 |
| RA-2 | Screenshots have two paths to maintain (D20) | One path breaks unnoticed | The report names the path used |
| RA-3 | A proof's file list is a model's judgment; a change outside it can break the shown behaviour with no note (D14, D21) | A reviewer trusts a stale proof | The executor confirms the list |
| RA-4 | With a reused branch name, another change's proof appears, though with a note (D32) | A reviewer sees an unrelated proof | The rewritten-history note and report line |
| RA-5 | A reviewer does not learn about a failed proof attempt (D27) | A missing proof reads as unnecessary | The skill's report names each failure |
| RA-6 | Masking patterns are incomplete and the model review is not certain (D17) | A secret reaches a PR body | Two layers; doubt drops the entry |
| RA-7 | A video appears in the PR only after pr-open runs (D15), and replacing the section overwrites manual edits to it (D16) | Delay; lost edits | The report says pr-open must run |
| RA-8 | Jev's quality on diffs is unknown until the measurement (D25) | Signals mislead the judgment | D3 lets the skill overrule; D10 falls back |

**Declared gaps.** Each states the working assumption this spec is written on. G1, G2, G3, G6 and G7 were closed on 2026-11-10 by D45, D46, D47, D50 and D48, G5's duration half the same day by D51, and G4 and G5's result-size half on 2026-11-11 by the phase-2 measurement (D22); their rows stay for the record.

| # | Gap | Owner | Placement |
|---|---|---|---|
| G1 | The session settled replacing an existing `## Proof` (D16), not a body with no section, nor an empty manifest over an existing section. Working assumption: insert before `## Risk` when entries exist (RA-7 implies a video arrives after the PR opens), and remove the section on an empty list (D40). | Mateusz | Closed by D45, 2026-11-10 |
| G2 | D22's "any part" is meaningful for the four positive facts, but read literally one docs-only part would suppress proof for a whole change. Working assumption: `no_behavior_change` takes the minimum across parts, the others the maximum. | Mateusz | Closed by D46, 2026-11-10; phase 2 observes it |
| G3 | The session did not settle whether `screenshot-proof` and `terminal-proof` write the manifest when run by hand. Working assumption: they do, and assign `files` themselves, because they have no other delivery path. | Mateusz | Closed by D47, 2026-11-10 |
| G4 | D22 says "as in `pr_risk`", but `pr_risk` part states hold no commits, because "commit messages can argue for their own risk" (`plugins/dev-kit/hooks/risk.ts:601-617`). D22 is written as ratified; only splitting and exclusions match `pr_risk`. | Mateusz | Closed 2026-11-11: phase 2 kept the variant without commits, and D22 now sends `commits` empty |
| G5 | No wall-clock cap on a mod tool call and no result-size cap are documented (`SPEC.research/cc-plugin-platform.md:138`). The result here is small; the eight-part duration is the open half. | Mateusz | Duration closed by D51 (probe), 2026-11-10; result size closed by the phase-2 measurement, 2026-11-11: 531-545 bytes over all 28 PRs, fixed shape (section 12) |
| G6 | Substitution of `${user_config.screenshot_widths}` with an empty default in a skill body is documented only for non-sensitive values in general (`SPEC.research/cc-plugin-platform.md:106`), not for empty ones. | Mateusz | Closed by D50 (probe), 2026-11-10; the CONFIG-1 row in section 8 still checks it |
| G7 | `gh` attaches at most 50 files per command (`gh pr edit --help`, gh 2.103.3), and UI-1 does not bound screens × widths. Working assumption: INTEGRATION-6 sends 50 at a time with repeated `gh pr edit <n> --body-file <file> --attach`; whether a `./` reference to a file not attached in that command stays untouched is undocumented. | Mateusz | Closed by D48 and D49, 2026-11-10: overflow goes to comments, so no repeated body edit |

## 4. Target architecture

```
prepare-proof ──proof_signals (optional)──> TypeSafe Jev
      │  one plan confirmation (D12)
      ├─> terminal-proof (terminal, api)  ─┐
      ├─> screenshot-proof                 ├─> ~/.cache/pr-proof/<repo>/<branch>/manifest.json
      └─> walkthrough-video record-only  ──┘                 │
                                                  pr-open reads it when present ──> ## Proof
```

### CONFIG-1: pr-proof `userConfig`

`plugins/pr-proof/.claude-plugin/plugin.json` gains:

| Key | Type | Default | Notes |
|---|---|---|---|
| `typesafe_api_key` | string, `sensitive` | none | Empty falls back to `TYPESAFE_API_KEY` |
| `typesafe_endpoint` | string | `https://api.typesafe.ai` | As dev-kit |
| `typesafe_model` | string | `jev-1.14.0` | As dev-kit |
| `screenshot_widths` | string | none | Comma-separated pixels; a saved non-empty value overrides D18 discovery |

`screenshot_widths` is one string, not `multiple`, because only plain substitution into skill text is documented. It has no `default`: a skill body never receives one, only values saved in `pluginConfigs` (D50). Each option also carries `title` and `description`, which the schema requires (`https://code.claude.com/docs/en/plugins-reference#user-configuration`).

### INFRA-1: Jev client copy

`plugins/pr-proof/hooks/jev.ts`, a regular file, self-contained. Copied from dev-kit at `e20a572`, with no import from another plugin:

| From | Symbols |
|---|---|
| `plugins/dev-kit/hooks/risk.ts` | `CUT_HUNK`, `MAX_RETRY_DELAY_MS`, `EXCLUDED_FILE`, `isExcluded`, `trimmedOption`, `clip`, `hunks`, `split`, `halve`, `diffPath`, `pool`, `RETRYABLE`, `retryDelay`, `isSafeRef`, `endpointUrl`, `httpError`, types `FileDiff`, `Part`, `Split`; `split` and `halve` without `truncatedCodeHunks`, so `isBulkFile` stays behind |
| `plugins/dev-kit/hooks/register.ts` | `limiter`, `send` with D51's retry wait in place of `$.clock.sleep`, `post`, `git`, `tooLong`, `resolveBase`, `readDiffs` without `clipBulk`, types `JevRequest`, `Limit` |
| `plugins/dev-kit/hooks/paths.ts` | `PROSE_FILE`, `AGENT_FILE` |

Constants in the copy:

```ts
const STATE_CHAR_BUDGET = 72_000   // the whole state: diff + commits + diffstat
const COMMITS_CHAR_BUDGET = 8_000
const DIFFSTAT_CHAR_BUDGET = 4_000
const MAX_PARTS = 8                // dev-kit uses 32; the confirmed cost figure assumes 8
const CONCURRENCY = 4
const MAX_ATTEMPTS = 3
const MAX_SPLIT_DEPTH = 3
```

The diffstat travels in every part and `commits` is empty (D22), so the diff budget per part is `STATE_CHAR_BUDGET - DIFFSTAT_CHAR_BUDGET`, 68,000 characters; `COMMITS_CHAR_BUDGET` enters no budget.

### API-1: `mcp__pr-proof__proof_signals`

Registered in `session.start` by `plugins/pr-proof/hooks/register.ts` only when a key exists; registration is wrapped in `try/catch`. No key means the tool does not exist, and nothing leaves the machine. Pure logic lives in `plugins/pr-proof/hooks/signals.ts`, so it can be tested.

Input: `{ base: string }`, the branch the change merges into, validated by `isSafeRef`. Auth: `Authorization: Bearer <key>`.

State of each request, one per part:

```ts
{ commits: '', diffstat: string, files: string[], diff: string, prose?: string }
```

`commits` is always the empty string, as in `pr_risk`'s part states (D22); the field stays because the measured state kept it, and no `git log` runs.

`diff` and `prose` are separated by file type as in `partState` (`plugins/dev-kit/hooks/risk.ts:604-617`); this copies `PROSE_FILE` and `AGENT_FILE` from `plugins/dev-kit/hooks/paths.ts`. Every `git diff` it runs passes `--no-relative`, as `plugins/dev-kit/hooks/register.ts:167-168,314` do, so a session in a subdirectory still reads the whole change.

Questions, all `noul`, in the wording tuned in phase 2 and accepted by the user on 2026-11-11:

```ts
const FACTS = {
  appearance_changed: '`diff` changes how a screen looks to a user, such as layout, styling or visible text.',
  ui_flow_changed:
    '`diff` changes what a user does across steps in the UI, or how the UI responds to a click, typing or other input. A change to layout, styling or text alone is not this.',
  endpoint_response_changed:
    '`diff` changes what an HTTP or RPC endpoint returns to its caller: its status, body, fields, error codes or headers, or which callers it allows.',
  command_output_changed:
    '`diff` changes what a command, script, migration, job, build or test run prints, logs or does when started from a terminal, including through the configuration or environment it reads. Code that only serves HTTP requests or renders a UI is not this.',
  no_behavior_change:
    'The change in `diff` leaves what the program does unchanged, as with documentation, comments, agent instructions, version bumps, removal of unreachable code or refactors that keep behaviour.',
}
const KIND_OF_FACT = {
  appearance_changed: 'screenshots', ui_flow_changed: 'video',
  endpoint_response_changed: 'api', command_output_changed: 'terminal',
}
```

Output on success, JSON text in `{ result }`:

```ts
type Signal = 'suggest' | 'reject' | 'uncertain'   // p >= 0.7, p <= 0.3, otherwise
{
  model: string,                                   // versioned ID Jev answered with
  signals: { screenshots: Sig, video: Sig, api: Sig, terminal: Sig },   // Sig = { signal: Signal, p: number }
  noBehaviorChange: Sig,
  suppressed: boolean,                             // noBehaviorChange.signal === 'suggest'
  coverage: { parts: number, filesNotAssessed: number, filesExcluded: number, truncatedHunks: number, partial: boolean },
}
```

`p` for a kind is the maximum across parts; `no_behavior_change` the minimum (D46). When `suppressed` is true the four kinds are returned with their own values, and the skill treats them as rejected unless it overrules (D3).

Errors: any failure returns `{ result: 'Proof signals unavailable: <reason>' }`, the shape `pr_risk` uses (`plugins/dev-kit/hooks/register.ts:149-151`). A missing numeric answer, an exhausted retry or a git failure each produce it. Limits: `$.http.fetch` 30 s per request, retries on `RETRYABLE` statuses, `max_tokens_exceeded` halves a part up to `MAX_SPLIT_DEPTH`. The copied `send` waits between retries with `$.process.run(['sleep', String(retryDelay(...) / 1000)], { timeoutMs: 30_000 })` in place of `$.clock.sleep`, and the hook ends in `.catch(($, e, next) => unavailable(...))` (D51). The argument can be fractional (`retry-after: 0.5` gives `'0.5'`), which BSD and GNU `sleep` accept; the wait is at most `MAX_RETRY_DELAY_MS`, 10 s, inside the 30 s timeout, and its exit code is ignored, since the retry follows either way.

### INTEGRATION-1: the manifest

Path, computed the same way by both plugins:

```sh
repo=$(basename -s .git "$(git remote get-url origin)")   # worktrees share it; the toplevel's name differs
branch=$(git branch --show-current | sed 's#/#%2F#g')
manifest="$HOME/.cache/pr-proof/$repo/$branch/manifest.json"
```

```jsonc
{
  "version": 1,
  "head": "<full sha at the last write>",
  "base": "main",
  "entries": [
    {
      "kind": "video | screenshots | terminal | api",
      "claim": "One sentence: what this proof shows.",
      "head": "<full sha when this entry was produced>",
      "files": ["src/a.ts"],
      "media": [{ "path": "/abs/file.png", "screen": "Checkout", "width": 375 }],
      "transcript": "/abs/terminal.txt"
    }
  ]
}
```

- `media` is absent on transcript entries; `screen` and `width` are absent on a video. `transcript` is absent on media entries.
- `head` per entry is required because D36 keeps older entries: advancing one top-level `head` would hide their staleness, and not advancing it would flag the entry just re-proven.
- `base` is reported, not compared. The writer that creates the manifest sets it: under prepare-proof that is whichever executor writes first, using the `base` prepare-proof passes with the URLs and `files` (D43); an executor run by hand (D47) uses the repository's default branch (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`); later writers keep it. Top-level `head` records the last write and nothing compares it: D13 keeps the field, and INTEGRATION-6 reads each entry's `head`.
- An empty `entries` list means "no proof needed" (D40). An unknown `version` is ignored by pr-open, and the report says so.
- Writes follow D36: load, drop entries of the same kind, append, set top-level `head` to HEAD. The `jq` recipe lives in DOCS-1.

### INTEGRATION-2: `prepare-proof` skill

`plugins/pr-proof/skills/prepare-proof/SKILL.md`. Arguments: `[base] [before]`; `base` defaults to the repository's default branch; `before` passes through to `screenshot-proof` (D19).

1. Refuse on the default branch or a detached HEAD.
2. Look up `mcp__pr-proof__proof_signals` with tool search and call it. The skill does not name the tool in `allowed-tools`, since that is undocumented for a mod tool (`SPEC.research/cc-plugin-platform.md:155`). Tool absent, or a result starting `Proof signals unavailable:`: judge from the diff alone and record "Jev not used" for the report (D10).
3. Decide each of the four kinds, or "no proof" when none applies. A decision against a `suggest` or `reject` signal states its reason (D3); `uncertain` is the skill's call (D24).
4. Assign the diff's files to each entry (D21).
5. Show the whole plan once: kinds, reasons, what will run (D12). With `before`, the same question asks for the base: a stack's URL, one already up, or a second stack started from a temporary worktree of `base`, which the plan then names (D44). Under an agent caller, end the turn with a `Confirmation needed` block, as `plugins/pr-proof/skills/walkthrough-video/SKILL.md:53` does.
6. When a planned kind needs the running app, bring up the stack (D43). Take how it runs and where the credentials live from the project's `CLAUDE.md` files; reuse a stack already up for this checkout, otherwise start and seed one and wait for readiness. A stack that does not come up fails each kind that needs it (D27); the others go on. With the second-stack choice (D44), the worktree is `~/.cache/pr-proof/<repo>/<branch>/base-worktree`, detached at `origin/<base>`, or at `base` when origin has no such branch, the order API-1's `resolveBase` uses. A worktree an earlier run left there is reused only when `git worktree list --porcelain` registers that path in this repository and `git -C <path> rev-parse HEAD` prints that commit. Otherwise a path registered here is cleared with `git worktree remove --force` before `git worktree add --detach`, and a stack still running from it is left alone (DOCS-1's other-stacks rule). A path occupied but not registered here, which another clone of the same name can leave, makes the add fail, and that counts as a base stack that does not come up. Give it its own dependency install and env, taken the project's own way, because a fresh worktree has no untracked env files. Start it, seed it under DOCS-1's shared-services rule, and wait for readiness. A base stack that does not come up, or a `before` with no base URL and no second stack, drops only the before shots: `before` is not passed on, and the report says so.
7. Invoke the per-kind skills with the Skill tool in D38's order, passing the URLs, where the credentials live (never a value), each entry's `files` and the run's `base` (INTEGRATION-1). A kind that fails is recorded for the report and the rest go on (D27).
8. Write the video entry from the path `walkthrough-video` reports. For "no proof", write an empty list (D40).
9. Report: Jev used or not, the kinds with reasons and overrules, each failure, the manifest path, that `pr-open` must run for the proof to appear (RA-7), and any stack this run started, asking before stopping it. Stopping the base stack also removes its worktree with `git worktree remove --force`, since install and env files leave it unclean (D44). Under an agent caller the question goes in a `Confirmation needed` block (D12).

### INTEGRATION-3: `screenshot-proof` skill

`plugins/pr-proof/skills/screenshot-proof/SKILL.md`. Arguments: `[urls] [credentials] [files] [base] [before]`; `base` defaults to the repository's default branch (INTEGRATION-1).

- Inputs: the app's URL, with `before` also the URL of a stack at the base, and where the credentials live, as a path or source, never a value. They come from prepare-proof or, run by hand, from the arguments, and the skill asks for what is missing. It never starts, seeds or stops a stack (D43).
- Widths: `${user_config.screenshot_widths}` when it is non-empty and does not still start with `${user_config.` (D50); otherwise the project's breakpoints, read from its styling configuration; otherwise 375, 768, 1440 (D18).
- Tool: `agent-browser` when `command -v agent-browser` succeeds, else Playwright via `pnpm dlx`, pinned as the ephemeral-tooling rule in DOCS-1 says (D20). The report names which ran.
- Output: `~/.cache/pr-proof/<repo>/<branch>/screenshots/<screen>-<width>.png`, one media item per screen and width.
- State after the change only; "before" shots only with the `before` argument and a base URL (D19, D44). With no base URL, the after shots go on, the before shots are skipped and the report says so. A before shot is its own media item whose `screen` ends in ` (before)`, so it renders as its own table row and pr-open needs no new field (D13).
- The user views and approves each screen (D31); under an agent caller, a `Confirmation needed` block. A rejected shot enters nothing, and the skill asks whether to retake (D39).
- The executor confirms `files`, and states any correction in its report (D21).
- It writes its own entry with DOCS-1's `jq` recipe, also under prepare-proof; run by hand it also assigns `files` itself (D47).

### INTEGRATION-4: `terminal-proof` skill

`plugins/pr-proof/skills/terminal-proof/SKILL.md`. Arguments: `terminal|api [urls] [credentials] [files] [base]`, `base` as in INTEGRATION-3.

- Inputs as in INTEGRATION-3, where the captured behaviour needs the running app; it never starts, seeds or stops a stack (D43).
- Captures observed behaviour of the changed thing; test-runner output is not a proof (D30).
- Modes share capture and masking; `api` writes kind `api`, `terminal` writes kind `terminal` (D8).
- Output: `~/.cache/pr-proof/<repo>/<branch>/<kind>.txt`, passed through INFRA-2, then a model review. Any doubt drops the entry, and the report says so (D17, D27).
- `files` and the entry as in INTEGRATION-3 (D21, D47).

### INTEGRATION-5: `walkthrough-video` record-only

The word `record-only` in the arguments, passed by prepare-proof, makes step 7 **Deliver** do one thing beyond acceptance: report the MP4's absolute path under `<work dir>/out/` and the `files` prepare-proof passed, confirmed against the recorded scenes, with any correction stated (D21). It skips the `~/Downloads` copy and the PR attachment (D15). Step 7's clean-up of `recast/.state/` and `recast/test-results/` still runs, because traces hold session cookies. Under `record-only` the stack is the caller's (`plugins/pr-proof/skills/walkthrough-video/SKILL.md:54`, `briefs/record.md:11`): prepare-proof passes the URLs and the credentials' path, and the recorder never starts, seeds or stops it (D43). Acceptance stays as today (D31, D39). Without the word, behaviour is unchanged.

### INTEGRATION-6: `pr-open` reads the manifest

In `plugins/dev-kit/skills/pr-open/SKILL.md`:

- Step 2 gains **Proof**: compute the path as INTEGRATION-1 shows. No file means no section and nothing in the report. A manifest `jq` cannot parse is handled as an unknown `version` (INTEGRATION-1).
- An entry whose media or transcript file is missing is left out of the section and named in the report (D27), because one missing `--attach` path makes `gh` refuse the whole command.
- For each entry: `git merge-base --is-ancestor <head> HEAD` failing, or the object being unknown, gives the rewritten-history note (D32). Otherwise `git log --format=%h <head>..HEAD -- <files>` printing anything gives the staleness note (D14). Empty `files` skips that command and gives no note, because `git log` with no path after `--` lists every commit.
- Media go into one `mktemp -d` directory with unique names, and the body file is written beside them, since `--body-file` references resolve against its directory (`gh pr edit --help`, gh 2.103.3).
- New PR: `gh pr create ... --body-file <file> --attach <media>...`. Existing PR: step 1 replaces `## Proof` as it replaces `## Risk`, with `gh pr edit <n> --body-file <file> --attach <media>...` (D16). With no section in the body and entries in the manifest, insert it just before `## Risk`; with an empty list, remove an existing section (D45).
- More than 50 media files: the body carries the first 50 in manifest order, and the section ends with a line naming how many more follow in comments. The rest go in batches of at most 50, each its own `gh pr comment <n> --body-file <file> --attach ...`, the body file in the same `mktemp -d` directory and opening with `<!-- pr-proof:overflow -->`, then each entry's `claim` and its remaining media as in UI-1 (D48). Before posting, list the PR's comments (`gh api repos/{owner}/{repo}/issues/<n>/comments --paginate`) and delete each one whose body starts with the marker and whose `user.login` equals the viewer's login from `gh api user --jq .login` (`gh api -X DELETE repos/{owner}/{repo}/issues/comments/<id>`), also when the new manifest needs no overflow (D49).
- After upload, re-read the body: it holds `https://github.com/user-attachments/assets/…` URLs and no `./` reference (D42). `gh` exits non-zero on a partial upload while still printing the URL; the report names what failed.
- The length budget excludes `## Proof` (D26).

### UI-1: the `## Proof` section

````markdown
## Proof

<sub>History was rewritten since this proof was taken.</sub>

<claim>

./video.mp4

<claim>

| Screen | 375 | 768 | 1440 |
|---|---|---|---|
| Checkout | ![Checkout at 375](./a.png) | … | … |

<claim>

<sub>Commits after this proof changed its files: abc1234.</sub>

```text
<transcript of at most 20 lines>
```

<claim>

<details><summary>Transcript (<n> lines)</summary>

```text
<transcript of more than 20 lines>
```

</details>
````

Placed just before `## Risk`; with no `## Risk`, last, above any link reference definitions (D7). Rendering is by fields: `width` on media makes a table, media without it stand on their own line, `transcript` makes a code block (D13). The rewritten-history note appears once, at the top.

### INFRA-2: masking script

`plugins/pr-proof/skills/terminal-proof/scripts/mask.sh <in> <out>`, Bash, BSD and GNU `sed -E` compatible. Exit 0 when written, non-zero otherwise; non-zero drops the entry (D17). It replaces with `***`:

- values after names matching `(token|secret|password|passwd|api[_-]?key|authorization|cookie)`, in `name=value`, `name: value` and JSON forms, case-insensitive;
- `Bearer <value>`;
- `gh[pousr]_…`, `github_pat_…`, `sk-…`, `AKIA…` and `eyJ…\.…\.…` tokens.

### DOCS-1: `plugins/pr-proof/references/rules.md`

Holds the whole of today's `skills/walkthrough-video/briefs/rules.md`, unchanged, plus INTEGRATION-1's path, schema and `jq` write recipe, the approval rule (D31, D39) and the agent-caller block (D12). Only `walkthrough-video` has `templates/clean.sh`: for the other skills the rules' work dir is `~/.cache/pr-proof/<repo>/<branch>/`, and every `rm` takes the **Deleting** rule's second sentence. Read through `${CLAUDE_SKILL_DIR}/../../references/rules.md`.

### DOCS-2 and DOCS-3

DOCS-2: `plugins/pr-proof/README.md` and `CHANGELOG.md` `[Unreleased]` describe the three new skills, the tool and the options. DOCS-2 also rewrites the one `description` that `plugins/pr-proof/.claude-plugin/plugin.json` and pr-proof's entry in `.claude-plugin/marketplace.json` share, the same text in both, to name `prepare-proof`, every proof kind (video, screenshots, terminal, API) and the hand-off to `pr-open` through the manifest, and adds `screenshots`, `terminal` and `api` to both the `keywords` and the `tags` lists, keeping the existing ones (D53). Neither file's `version` changes; `release.sh` bumps it. DOCS-3: `plugins/dev-kit/README.md` and `CHANGELOG.md` `[Unreleased]` describe `## Proof`.

### TEST-1: unit tests

`plugins/pr-proof/tests/signals.test.ts` on `claude-code/testing`, covering threshold boundaries (0.3, 0.7), maximum and minimum aggregation, suppression, exclusions, the unavailable result and D51's retry wait (a `503` then a `200` makes one `process.run` with argv `['sleep', '1']`, a `retry-after: 0.5` one with `['sleep', '0.5']`, and the call returns signals). Run with `claude plugin test plugins/pr-proof`.

### TEST-2: the measurement

20-30 of the user's PRs, each labelled with the right proof kinds, in `plugins/pr-proof/evals/proof-signals/local/`, harness included. For each PR: Jev signals from `signals.ts` against the skill alone, where "skill alone" is the judging section of INTEGRATION-2 drafted in phase 2 and moved into the skill in phase 3, run without signals. It also runs G4's comparison and G5's largest PR. No hard gate (D25).

### TEST-3: pr-open eval case with a manifest

One promptfoo case, `pr-open-proof`, in `plugins/dev-kit/evals/` (D52). It opens a new PR from a branch whose manifest holds a screenshots entry and a long terminal entry, and checks the posted body against UI-1 and INTEGRATION-6.

- `cases/pr-open-proof/`: the pr-open fixture layout (`base/`, `base-log`, `branch`, `commits/<k>/{tree,message}`, `reset-sandbox.sh:63-65`), `base/` holding the three-section `.github/pull_request_template.md` the other pr-open cases carry, since `bodyChecks` requires its sections, branch `feat/checkout-summary`, one commit touching a UI file and a CLI script, no `push` file, so the PR is new. Beside it `proof/`: six PNGs (screens `Cart` and `Checkout` × 375, 768, 1440; a 1×1 pixel each is enough) and `terminal.txt` of 25 lines, past D35's 20.
- `reset-sandbox.sh`: `pr-open-proof` joins the pr-open loop (line 86). After the loop it copies `proof/` to `.sandbox/pr-open-proof-proof/`, removes `$HOME/.cache/pr-proof/pr-open-proof-origin/`, and writes the manifest there with `jq` (D54): `version` 1, `base` `main`, both entries' `head` and the top-level `head` the branch's HEAD, `files` the commit's paths, media paths absolute into `.sandbox/pr-open-proof-proof/`. The repository name is `pr-open-proof-origin` because the origin is `.sandbox/<case>-origin.git` (`reset-sandbox.sh:89`).
- `gh-stand-in.sh` (D55): `pr create`, `pr edit` and `pr comment` take repeated `--attach <path>`, exit 1 naming the first missing file before anything else, and in the stored body (the `gh-posted-*.md` copy and `pr.json`) replace each `./<path>` of an attached file with `https://github.com/user-attachments/assets/<k>`, `<k>` counting from 1 per call. `api` replaces `{owner}` with `example` and `{repo}` with `web` in the path, and `-X DELETE` on `repos/example/web/issues/comments/<id>` removes that comment from its `comments.json`. Every existing call keeps its behaviour.
- `checks/pr-open.mjs`: `parse()` strips `## Proof` from the budget text as it strips `## Risk` (D26; lines 30-38). A new export `proof` runs `bodyChecks` and asserts: `## Proof` is present, just before `## Risk` when the body has one, else the last `##` section; both entry `claim`s appear in it; a table with header `| Screen | 375 | 768 | 1440 |` and the rows `Cart` and `Checkout`; the transcript inside `<details>`, with no staleness or rewritten-history note; six `user-attachments` URLs and no `./` reference; among the `gh-calls.log` lines that ran `# in` `.sandbox/pr-open-proof`, since every scenario of a trial shares the log, one `pr create` with six `--attach` arguments and none naming `terminal.txt`.
- `promptfooconfig.yaml`: a test `pr-open-proof` after line 210, prompt `pr-open`, a request that reports `pnpm test` passing and no browser check, `checkout` `plugins/dev-kit/evals/.sandbox/pr-open-proof`, the stand-in as `gh`, asserting `file://checks/pr-open.mjs:proof`.

The case runs locally with `scripts/run-evals.sh dev-kit pr-open-proof`; no workflow runs dev-kit evals (section 5).

### Prerequisites

| Prerequisite | Status |
|---|---|
| Claude Code ≥ 2.1.287 for mods | Met: 2.1.319 installed (`SPEC.research/cc-plugin-platform.md:3,6`) |
| `gh` ≥ 2.103 for `--attach` on create and edit | Met: 2.103.3 installed (`gh --version`) |
| TypeSafe key for phase 2 | User holds one (`SPEC.research/prior-conversation.md:16`); absent key blocks only the measurement |
| `feat/pr-risk-fe` merged, as it rewrites `register.ts` and `risk.ts` | Met: PR #38, merge commit `a568d4b` |
| `agent-browser` CLI | Optional (D20); present at `/opt/homebrew/bin/agent-browser` on the author's machine |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| `grixu/cc-toolkit` `plugins/pr-proof` | All of pr-proof's elements, and pr-proof's entry in `.claude-plugin/marketplace.json` (DOCS-2) | PR, then `./scripts/release.sh pr-proof <bump>` |
| `grixu/cc-toolkit` `plugins/dev-kit` | INTEGRATION-6, UI-1, DOCS-3, TEST-3 | PR, then `./scripts/release.sh dev-kit <bump>` |
| TypeSafe API | Answers to API-1 | External; no change |

Approval: the repository's single owner reviews and merges. CI runs ShellCheck on every `.sh` (`.github/workflows/lint.yml:16`); no workflow runs `claude plugin test`, so TEST-1 runs locally. The only eval workflow runs fd3's suite on `plugins/fd3/**` (`.github/workflows/fd3-evals.yml:1,8-9`), so TEST-3 runs locally too. Landing constraint: D29, two PRs in order. Installed sessions run the released cache, so a change reaches them only after release.

## 6. The change, per repository

Repository `grixu/cc-toolkit`. Files are new unless Kind says otherwise.

### `plugins/pr-proof`

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| W1 | Add the four `userConfig` options | CONFIG-1 | `.claude-plugin/plugin.json` | Changed | 1 | One PR |
| W2 | Copy the Jev client helpers | INFRA-1 | `hooks/jev.ts`; sources `plugins/dev-kit/hooks/risk.ts:20,26,28-34,443,449-456,477-479,559-561,723-806,881-900,1206-1223`, `plugins/dev-kit/hooks/register.ts:293-321,341-342,346-360,425,469-491`, `plugins/dev-kit/hooks/paths.ts:1-2` | New | 1 | One PR |
| W3 | Register `proof_signals`, build state, ask facts, aggregate | API-1 | `hooks/hooks.json`, `hooks/register.ts`, `hooks/signals.ts` | New | 1 | One PR |
| W4 | Unit tests | TEST-1 | `tests/signals.test.ts` | New | 1 | One PR |
| W5 | Label PRs, measure, tune the questions | TEST-2, API-1 | `evals/proof-signals/local/` (git-ignored); wording in `hooks/signals.ts` | New | 2 | One PR: the wording commit only |
| W6 | Move shared rules, add manifest contract, repoint the skill | DOCS-1, INTEGRATION-1 | `references/rules.md`; removes `skills/walkthrough-video/briefs/rules.md`; `skills/walkthrough-video/SKILL.md:27` | New, changed, removed | 3 | One PR |
| W7 | Masking script | INFRA-2 | `skills/terminal-proof/scripts/mask.sh` | New | 3 | One PR |
| W8 | `terminal-proof` skill | INTEGRATION-4 | `skills/terminal-proof/SKILL.md` | New | 3 | One PR |
| W9 | `screenshot-proof` skill | INTEGRATION-3 | `skills/screenshot-proof/SKILL.md` | New | 3 | One PR |
| W10 | `record-only` mode | INTEGRATION-5 | `skills/walkthrough-video/SKILL.md:43-47,54,57` | Changed | 3 | One PR |
| W11 | `prepare-proof` skill | INTEGRATION-2 | `skills/prepare-proof/SKILL.md` | New | 3 | One PR |
| W12 | README, changelog, descriptions, keywords and tags | DOCS-2 | `README.md`, `CHANGELOG.md`, `.claude-plugin/plugin.json:3,10-17`; at the repository root `.claude-plugin/marketplace.json:213,220-226` | Changed | 3 | One PR |

### `plugins/dev-kit`

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| W13 | Read the manifest, render, insert, replace or remove `## Proof`, attach media, post and clear overflow comments, exclude it from the budget | INTEGRATION-6, UI-1 | `skills/pr-open/SKILL.md:19,33,81,107,113-115` | Changed | 4 | One PR |
| W14 | README and changelog | DOCS-3 | `README.md`, `CHANGELOG.md` | Changed | 4 | One PR |
| W15 | Eval case for pr-open with a manifest: fixture, sandbox reset, stand-in `--attach` and comment calls, check, test entry | TEST-3 | `evals/cases/pr-open-proof/`; `evals/reset-sandbox.sh:86` plus a block after line 106; `evals/gh-stand-in.sh:131-209,236-319`; `evals/checks/pr-open.mjs:30-38` plus a new export; `evals/promptfooconfig.yaml` after line 210 | New, changed | 4 | One PR, with W13 and W14 (D52) |

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | Mod: W1-W4 | `plugins/pr-proof` | No; unreleased | No |
| 2 | Measurement: W5, after phase 1 | Local, plus wording commit | No | No |
| 3 | Skills: W6-W12, after phase 2 | `plugins/pr-proof` | Yes, on the pr-proof release at the gate | **Yes**: deliberately separate PR (D29), then the release |
| 4 | pr-open: W13-W15 | `plugins/dev-kit` | Yes, on a dev-kit release (section 10) | Final; closes its unit |

Landing units: phases 1-3 are one branch and one PR; phase 4 is the second. The aggregate of each is well under the size at which a unit would need subdividing (section 12).

Environment order: no environments exist; the release is the only deployment boundary, and no waiting period applies.

Hard dependencies outside this spec: none. `feat/pr-risk-fe` already merged (PR #38).

Orderings inside this spec:

- Phase 2 **must have run** before the pr-proof release: a release ordering (D29).
- Phase 3 is written after phase 2 by D29, and needs its judging draft: a development ordering inside one branch.
- Phase 4 is **merged** after the phase-3 PR: a merge ordering by D29. There is no code dependency, because pr-open reads a file.

The release at the phase-3 gate is `./scripts/release.sh pr-proof minor`, because it adds skills and a tool to 0.1.0.

Rollback:

- Phase 3: revert the PR and release a patch. Complete when the installed cache is at the new version; files in `~/.cache/pr-proof/` are then inert.
- Phase 4: revert the PR and release dev-kit. A released pr-open without the change ignores the manifest, so nothing else is needed. A `## Proof` already in an open PR stays until edited by hand.

## 8. Verification

Probes:

| Element | Check | Where it runs | Before the change | After |
|---|---|---|---|---|
| CONFIG-1 | `jq -c '.userConfig \| keys' plugins/pr-proof/.claude-plugin/plugin.json`; `claude plugin validate plugins/pr-proof` | Branch | `jq` exits 5: `null (null) has no keys` | `["screenshot_widths","typesafe_api_key","typesafe_endpoint","typesafe_model"]`; validation passes |
| INFRA-1 | `test -f plugins/pr-proof/hooks/jev.ts && test ! -L plugins/pr-proof/hooks/jev.ts` | Branch | Fails | Passes |
| TEST-1, API-1 (phase 1) | `claude plugin test plugins/pr-proof` | Branch | No tests | All pass |
| TEST-1, API-1 (D51) | The retry tests in `tests/signals.test.ts`: `http.fetch` answers `503`, then `200`; `process.run` argv recorded | Branch | No tests | One `['sleep', '1']` (and `['sleep', '0.5']` with `retry-after: 0.5`), and the result holds signals, not "unavailable" |
| INFRA-2 | `mask.sh` over a file holding `TOKEN=abc`, `Authorization: Bearer xyz` and a `ghp_` token; ShellCheck in CI | Branch | Script absent | Output holds `***` and none of the three values |
| DOCS-1 | `test -f plugins/pr-proof/references/rules.md && test ! -f plugins/pr-proof/skills/walkthrough-video/briefs/rules.md` | Branch | Fails | Passes |
| DOCS-2 (D53) | `jq -r .description plugins/pr-proof/.claude-plugin/plugin.json` against `jq -r '.plugins[] \| select(.name=="pr-proof") \| .description' .claude-plugin/marketplace.json`; then the same for `keywords` and `tags` | Branch, phase 3 | Identical text naming only the video; lists without `screenshots`, `terminal`, `api` | Identical text naming `prepare-proof` and all four kinds; both lists hold the three new words and the old ones |

Triggered:

| Element | Check | Where it runs | Before the change | After |
|---|---|---|---|---|
| API-1 (no key) | Start with `--plugin-dir plugins/pr-proof` and no key; search for the tool | Branch | Tool absent | Tool absent |
| API-1 (key) | Call on a branch with a UI change | Branch | Tool absent | JSON with all four kinds, `model` and `coverage` |
| CONFIG-1 (D50) | Leave `screenshot_widths` unset, then save `""`, then `400,900`; read what `screenshot-proof` receives | Branch, phase 3 | Skill absent | Unset (literal text) and empty use D18 discovery; `400,900` is used |
| INTEGRATION-1, INTEGRATION-2 | Run `/pr-proof:prepare-proof` with Jev, then with no key | Branch of a sample repo | Skill absent | One confirmation; manifest written; the no-key report says Jev was not used |
| INTEGRATION-2 (D43) | Run with no stack up, then with one already up | Branch of a sample repo | Skill absent | First run starts one stack before the first executor and asks before stopping it; second run reuses it and asks nothing |
| INTEGRATION-2 (D27, D43) | Plan only a `terminal` kind that needs no app; then plan `screenshots` and such a `terminal` with a stack that cannot start | Branch of a sample repo | Skill absent | First run starts no stack; second writes the terminal entry and no screenshots entry, and the report names the failure |
| INTEGRATION-3, INTEGRATION-4 (D43) | Run by hand with no URL | Branch of a sample repo | Skill absent | The skill asks for the URL and starts no stack |
| INTEGRATION-1 (D36) | Re-run one kind after a new commit | Branch of a sample repo | Skill absent | That entry and its `head` replaced, the others unchanged |
| INTEGRATION-3 | Run on a UI change; reject one shot | Branch of a sample repo | Skill absent | Approved shots only in the manifest, and a retake question |
| INTEGRATION-2, INTEGRATION-3 (D44, URL) | `before` through prepare-proof, answering with a base stack's URL; then `screenshot-proof` by hand with `before` and that URL | Branch of a sample repo | Skill absent | Manifest media include items whose `screen` ends ` (before)`; no worktree and no second stack created |
| INTEGRATION-2, INTEGRATION-3 (D44, second stack) | `before` through prepare-proof, choosing the second stack, then accepting its stop | Branch of a sample repo | Skill absent | The plan names the worktree; ` (before)` items in the manifest; after the stop `git worktree list` no longer shows it |
| INTEGRATION-2 (D44, leftover worktree) | Leave the base worktree at an older commit and run `before` with the second stack; then occupy the path with a directory git has not registered | Branch of a sample repo | Skill absent | First run: `git -C <path> rev-parse HEAD` prints the base's commit; second: after shots only, and the report says the before shots were skipped |
| INTEGRATION-2, INTEGRATION-3 (D44, no base) | `before` with a second stack that cannot start; then `before` with no URL and no second stack | Branch of a sample repo | Skill absent | After shots in the manifest, no ` (before)` items; the report says the before shots were skipped |
| INTEGRATION-4 | `terminal` and `api` runs by hand on a change with a planted secret | Branch of a sample repo | Skill absent | Secret absent from the transcript; `api` and `terminal` are separate kinds, each with the `files` it assigned (D47) |
| INTEGRATION-5 | Under prepare-proof, and by hand | Branch of a sample repo | Attaches to the PR | `record-only`: no PR edit and no Downloads copy, clean-up ran, stack neither started nor stopped; by hand: as today |
| INTEGRATION-6, UI-1 | `pr-open` with a manifest on a new PR, then again on the open PR | Draft PR on a sample repo | No `## Proof` | Section just before `## Risk`, with uploaded URLs and no `./` |
| INTEGRATION-6 (D14, D32) | Add a commit touching an entry's `files`; then rebase | Draft PR on a sample repo | No note | Staleness note; then the rewritten-history note and report line |
| INTEGRATION-6 (D40) | Manifest with empty `entries` | Draft PR on a sample repo | No section | No section |
| INTEGRATION-6 (D45) | Open a PR with no manifest, write a manifest with entries and run `pr-open`; then empty the manifest's list and run it again | Draft PR on a sample repo | No `## Proof` | First run inserts the section just before `## Risk`; second removes it |
| INTEGRATION-6, UI-1 (D48, D49) | Manifest with 53 media, then re-run with 53, then with 10 | Draft PR on a sample repo | No `## Proof` | 50 in the body and one marked comment with 3; re-run leaves exactly one marked comment; the 10-media run leaves none, and comments without the marker stay |
| TEST-3, INTEGRATION-6, UI-1 (D52) | `scripts/run-evals.sh dev-kit pr-open-proof`, then `scripts/run-evals.sh dev-kit pr-open`, whose pattern runs the three existing pr-open cases beside `pr-open-proof`, since `parse()` changes | Local, on the phase-4 branch | No test matches `pr-open-proof`; the three pass | `pr-open-proof` passes every check of TEST-3's `proof`; the three still pass |

Observed only:

| Element | Check | Where it runs | Before the change | After |
|---|---|---|---|---|
| TEST-2 (phase 2) | Observation, not a test: agreement of signals with labels, against the skill alone, over 20-30 PRs; also D46, G4, G5 | Local | No figures | Figures recorded in the git-ignored directory; no pass threshold (D25) |

Phase coverage: phase 1 by the CONFIG-1, INFRA-1, TEST-1 and API-1 rows; phase 2 by TEST-2; phase 3 by DOCS-1, DOCS-2's descriptions, INFRA-2 and INTEGRATION-1 to 5; phase 4 by INTEGRATION-6, UI-1 and TEST-3. DOCS-3 and DOCS-2's README and changelog have no row: they are prose, and `release.sh` itself fails on an empty `[Unreleased]`.

## 9. Cleanup

W6 removes `skills/walkthrough-video/briefs/rules.md` in the commit that adds its replacement; git keeps it, so the step is reversible. Nothing irreversible is planned.

## 10. Out of scope

Everything below surfaced during analysis; none of it was ratified. Two earlier items, the pr-proof descriptions and the pr-open eval case, moved into scope on 2026-11-11 as D53 and D52.

| Item | Owner | Placement |
|---|---|---|
| Releasing dev-kit after phase 4, without which installed sessions keep the old pr-open | Mateusz | After the phase-4 merge, `./scripts/release.sh dev-kit <bump>`; done 2026-11-12 as dev-kit 0.9.0 (tag `dev-kit/v0.9.0`, `a51f464`) |
| Passing proof to `pr_risk` as `context` on a new PR, where evidence otherwise goes uncredited (`plugins/dev-kit/skills/pr-open/SKILL.md:33`) | Mateusz | Decided at the phase-4 review, 2026-11-11: no, the manifest does not feed `pr_risk` ([implement-answers.md](implement-answers.md), Q6) |
| Eviction of old directories under `~/.cache/pr-proof/` | Mateusz | Decided 2026-11-12, after the pr-proof 0.2.0 release: no eviction rule ([SPEC.notes.md](SPEC.notes.md) section 3a) |

## 11. Tickets

None exist and none are new. `gh issue list -R grixu/cc-toolkit` shows only #1 and #9, unrelated; open PR #32 is on code-review. No ticket is created by this spec.

## 12. Appendix: the evidence record

| Claim | How it was verified |
|---|---|
| pr-open has no proof section and appends `## Risk` last, also under a template | Read `plugins/dev-kit/skills/pr-open/SKILL.md:81`. The notes say 0.7.0; the plugin is now 0.8.0 and the fact holds. |
| pr-open replaces `## Risk` on an existing PR and leaves a body without it | `plugins/dev-kit/skills/pr-open/SKILL.md:19` |
| The length budget excludes only Risk today | `plugins/dev-kit/skills/pr-open/SKILL.md:107` |
| `walkthrough-video` attaches unless the caller says otherwise | `plugins/pr-proof/skills/walkthrough-video/SKILL.md:45,57` |
| Traces hold session cookies, so clean-up stays under `record-only` | `plugins/pr-proof/skills/walkthrough-video/SKILL.md:47` |
| `briefs/rules.md` is referenced only from the skill's `SKILL.md` | `search_code` for `rules.md` under `plugins/pr-proof` returned one file; line 27 read. |
| No `userConfig` in pr-proof today | `jq` over `plugins/pr-proof/.claude-plugin/plugin.json` printed `null`. |
| dev-kit's defaults for endpoint and model | `plugins/dev-kit/.claude-plugin/plugin.json`; `plugins/dev-kit/hooks/risk.ts:1211`; `plugins/dev-kit/hooks/evidence.ts:1` |
| Key absent means tool absent | `plugins/dev-kit/hooks/register.ts:64-65` |
| Mods load from `hooks/hooks.json` with `modules`, no manifest key | `plugins/dev-kit/hooks/hooks.json` read; dev-kit `plugin.json` keys hold no `hooks`. |
| Copied helpers and their ranges | Read `plugins/dev-kit/hooks/risk.ts` and `register.ts` at `a568d4b`. The ranges in W2 total about 200 lines against the notes' estimate of about 150. |
| A symlinked import loads only from a git-cloned marketplace | Probe, `SPEC.research/symlink-import-probe.md:9-13` (Claude Code 2.1.319) |
| `MAX_PARTS = 8` | Chosen while writing, to match the confirmed cost figure's "at most 8 parts". dev-kit's `MAX_PARTS` is 32 and `MAX_SLICES` is 8 (`plugins/dev-kit/hooks/risk.ts:11-12`). |
| Jev cost is below 1 cent per PR | Notes, section 3, on 8 parts. Recomputed: 72,000 chars at the worst 2.7 chars/token (`plugins/dev-kit/hooks/risk.ts:792`) is about 26.7k tokens, at $0.042/Mtok (`SPEC.research/jev-api.md:43`) about $0.0011 per part, $0.009 for 8; halved parts add a little. |
| The notes' "3 chars per token, the assumption in `plugins/dev-kit/hooks/risk.ts`" has drifted | `plugins/dev-kit/hooks/risk.ts:6-7` now says 3.5-3.8. The conclusion holds per the row above. |
| Diffstat 4,000 chars inside the 72,000 total, so 68,000 for the diff | Chosen while writing, so the 72,000-char figure holds per part with the diffstat in every part; since D22's amendment `commits` is empty and `COMMITS_CHAR_BUDGET` enters no budget. As built: `DIFF_CHAR_BUDGET = STATE_CHAR_BUDGET - DIFFSTAT_CHAR_BUDGET` (`plugins/pr-proof/hooks/register.ts:29`, `feat/prepare-proof` at `5b8363a`). |
| Phase 2 kept the state without commits (G4, D22) | `plugins/pr-proof/evals/proof-signals/local/g4-variant.md:3-14` (git-ignored, main checkout): four wording pairings over 112 cells each, without commits better in all, run-to-run noise at most 0.003 Brier. As built: `commits: ''` in `partState` (`plugins/pr-proof/hooks/signals.ts:44-54`, `feat/prepare-proof` at `5b8363a`). |
| Default per-question limit is 32k tokens | `SPEC.research/jev-api.md:33` |
| `noul` returns a 0..1 probability and no confidence | `SPEC.research/jev-api.md:15` |
| 0.7 and 0.3 are the documented starting thresholds | `SPEC.research/jev-api.md:76` |
| Jev has no published benchmark on diffs | `SPEC.research/jev-api.md:72`: a documented absence, so RA-8 is open until phase 2. |
| Numeric rate limits are not public | `SPEC.research/jev-api.md:41`. `CONCURRENCY = 4` is copied from `plugins/dev-kit/hooks/register.ts:53`; a 429 past retries lands in D10's fallback. |
| A missing optional dependency form | `SPEC.research/cc-plugin-platform.md:90`: documented absence, from a grep of that page. |
| `register(on, options)` receives `userConfig` values | `SPEC.research/cc-plugin-platform.md:105` |
| Registered tool name is `mcp__<plugin>__<tool>`, deferred by default | `SPEC.research/cc-plugin-platform.md:121,126` |
| `gh pr create` and `gh pr edit` both take `--attach`, resolving `./` against the body file | `gh pr create --help`, `gh pr edit --help`, gh 2.103.3. Partial failure: non-zero exit, URL still printed. |
| `plugins/*/evals/*/local/` is git-ignored | `.gitignore:16`; `git check-ignore -v` matched the planned path. |
| The mod test runner exists | `claude plugin --help` lists `test [dir]`; `plugins/dev-kit/tests/evidence.test.ts:1` imports `claude-code/testing`. |
| `release.sh` needs a filled `[Unreleased]` | `scripts/release.sh:23` |
| Each landing unit is below the subdivision size | Estimate from W1-W15: unit one about 15 files and 1,110 lines, unit two about 18 files (seven of them fixture media and text) and 350 lines. |
| Default width set 375, 768, 1440 | D18, the user's answer; no project evidence claimed. |
| `%2F` encoding, `manifest.json`, `<kind>.txt` and the `screenshots/` layout | Chosen while writing, inside D37 and D6. |
| Repository name from `git remote get-url origin` | Inference: the toplevel's basename differs between worktrees, and two plugins must compute the same path. |
| Per-entry `head` | Inference from D36 with D14; not separately ratified. |
| `record-only` as the argument; the Skill tool as the routing mechanism; `Downloads` skipped under it | Element detail chosen to carry D15 and D4; not separately ratified. |
| Masking pattern list | Chosen while writing; RA-6 accepts that it is incomplete. |
| FACTS wording and `signals.ts` split | The split chosen while writing, from D23. The wording is the phase-2 tuned text (`plugins/pr-proof/hooks/signals.ts:6-15`, `feat/prepare-proof` at `5b8363a`), accepted by the user on 2026-11-11 (`SPEC.notes.md` section 3a), with agreement up from 79 to 96 of 112 cells (`g4-variant.md:5-10`). |
| The "skill alone" arm drafted in phase 2 | Inference: D29 places the measurement before the skills, and D25 needs that arm. |
| Pure helpers kept apart from mods API calls | Precedent, `plugins/dev-kit/hooks/risk.ts:1` |
| pr-proof's two descriptions are one text naming only the video; the lists lack the new kinds | `plugins/pr-proof/.claude-plugin/plugin.json:3,10-17`; `.claude-plugin/marketplace.json:213,220-226`, read at `836deea`. |
| `screenshots`, `terminal`, `api` as the added keywords and tags | Proposed while writing, one word per new kind beside the existing `video`; the user ratified the list on 2026-11-11 (D53). |
| dev-kit has a promptfoo suite with three pr-open cases built from `cases/` fixtures | `plugins/dev-kit/evals/promptfooconfig.yaml:175-210`; `plugins/dev-kit/evals/reset-sandbox.sh:63-106`. |
| The stand-in keeps created and edited bodies for the checks and logs every call | `plugins/dev-kit/evals/gh-stand-in.sh:11,141,169`; `plugins/dev-kit/evals/checks/pr-open.mjs:10-13`. |
| The stand-in ignores `--attach` and rewrites no `./` reference | `plugins/dev-kit/evals/gh-stand-in.sh:131-158,160-180`: only `--head`, `--body-file`, `-F`, `--title`, `--base`, `--draft`, `--body` and the label flags are read. |
| The stand-in serves comment paths only as literal `repos/example/web/...`, and a single comment only by `PATCH` | `plugins/dev-kit/evals/gh-stand-in.sh:288,301-303,319`; real `gh api` fills `{owner}`/`{repo}` from the current repository. |
| The pr-open budget check strips only `## Risk` | `plugins/dev-kit/evals/checks/pr-open.mjs:30-38,65-68`. |
| TEST-3's repository name is `pr-open-proof-origin` | The pr-open loop sets the origin to `.sandbox/<case>-origin.git` (`plugins/dev-kit/evals/reset-sandbox.sh:89,95`), and INTEGRATION-1 takes `basename -s .git` of it. |
| The eval sandbox can read `~/.cache/pr-proof/` | `scripts/evals-isolation.json` denies no `~/.cache` path, and the sandbox reads "most of the machine" by default (`https://code.claude.com/docs/en/sandboxing`, the access table). TEST-3's first run confirms it in place. |
| Overriding `HOME` for the agent would move Claude Code's config with it | Inference: the provider passes `vars.env` into the agent SDK's process `env` (`plugins/dev-kit/evals/provider.mjs:50`); not probed. |
| No workflow runs dev-kit evals | `.github/workflows/fd3-evals.yml:1,8-9` filters on `plugins/fd3/**`; the other four workflows' names (`lint`, `code-review-scripts`, `pullfrog`, `sync-hookify`) were read, not their bodies. |
| One case runs alone by a pattern argument | `scripts/run-evals.sh:5-8,24-27`. |

### Validation 2026-11-09, pass 1

Verdict: not ready — claims: 47 verified / 11 deferred / 1 blocked — spec 548 lines at this verdict

Checked against `grixu/cc-toolkit` at `a568d4b`. Rows spot-checked: every row gating a phase or justifying a removal, plus the pr-open, walkthrough-video, dev-kit-default and Jev-citation rows; the Jev rows were read in `SPEC.research/jev-api.md`, not re-fetched.

| Claim | How it was verified |
|---|---|
| Every `path:line` in sections 1-12 resolves | Read `plugins/dev-kit/skills/pr-open/SKILL.md`, `plugins/pr-proof/skills/walkthrough-video/SKILL.md`, `plugins/dev-kit/hooks/register.ts`, the cited ranges of `risk.ts`, `paths.ts`, `.gitignore`, `lint.yml`, `release.sh` and the four research files. W13's range now runs to line 115, which deletes the temporary file INTEGRATION-6 turns into a directory. |
| Blocking, closed: a `before` shot had no place in the manifest or in UI-1 | D19 allows the shot, while `media` items hold only `path`, `screen`, `width`. INTEGRATION-3 now puts it in `screen`, the one form that needs no pr-open change (D13). |
| Blocking, open: INTEGRATION-3 and INTEGRATION-4 do not say who brings up the app, with which credentials, or who stops it | `plugins/pr-proof/skills/walkthrough-video/SKILL.md:20-21,47` settle this for video only; D38's rationale assumes a shared stack. Handed to the user as a repair choice. |
| INFRA-1's copy list was not self-contained | `hunks` needs `CUT_HUNK` (`risk.ts:20`), `retryDelay` needs `MAX_RETRY_DELAY_MS` (`risk.ts:26`), and halving needs `tooLong` (`register.ts:422`), plus five types. `split` calls `isBulkFile` (`risk.ts:785`) only for `truncatedCodeHunks`, which API-1 does not report. |
| D21 covers every executor | INTEGRATION-3 and INTEGRATION-4 confirmed `files`; INTEGRATION-5 did not, and now does. |
| W3's phase cell agrees with section 7 | It named phase 2, where section 7 places only W5, which already owns the wording; the cell now reads 1. |
| G2's placement names a real event | "Phase 1 merges" does not exist: phases 1-3 are one PR. It now reads "phase 1 ends". |
| "Lines 5, 7, 8 and 9 are carried forward" | `SPEC.research/prior-conversation.md:9` has pr-open using the skills, which D5 does not do. Section 1 now says so. |
| CONFIG-1's contract is complete, and its probe's before-state is right | `title` and `description` are required (`https://code.claude.com/docs/en/plugins-reference#user-configuration`). `jq -c '.userConfig \| keys'` exits 5 on today's file rather than printing `null`. |
| `briefs/rules.md` is referenced only from `SKILL.md:27` | Re-run over all of `plugins/pr-proof`: one file, one line. |
| `sed -E` can be case-insensitive on BSD and GNU | `/usr/bin/sed -E 's/(token)=[^ ]*/\1=***/I'` on Darwin 25.6 masked `TOKEN=abc`; GNU documents the same flag. |
| `agent-browser` can shoot at a width | `agent-browser --help` lists `set viewport <w> <h>` and `screenshot [path]`. |
| `gh` contract, including its limit | `gh pr create --help` and `gh pr edit --help`, gh 2.103.3: `--attach`, `./` rewrite and partial failure hold; at most 50 files per command. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: `main` requires a PR and one approval, and the owner bypasses. `.github/workflows/*.yml` read: none runs `claude plugin test`; first-parent history shows releases pushed to `main`. |
| Build-order join across sections 4, 6 and 7 | Walked W1-W14 against the rollout: W3 builds on W2, W5 on W3, W8 and W9 on W6 and W7, W11 on W8-W10, W13 reads only the file. |
| Non-blocking, left open | `gh` 50-file limit unstated; missing media, malformed manifest and empty `files` undefined in INTEGRATION-6; `rules.md` moved unchanged names a `clean.sh` only `walkthrough-video` has; top-level `head` has no reader. |

After the user's answer on the handed-up repair choice, same pass:

| Claim | How it was verified |
|---|---|
| Blocking, closed: stack ownership for the two executors | The user chose prepare-proof as sole owner, recorded as D43. The repair is in INTEGRATION-2 to INTEGRATION-5 and in two new verification rows. |
| `walkthrough-video` already has a mode for a caller's stack | `plugins/pr-proof/skills/walkthrough-video/SKILL.md:54,47` and `briefs/record.md:11`. W10 now includes line 54, because `record-only` selects that mode. |
| D38's "a dead stack is found early" against D43 | It no longer follows from the order: INTEGRATION-2 step 6 brings the stack up before the first executor, so bring-up finds it. The order stands as cheapest first, and the rationale now says so. |
| D19 under D43 | A `before` shot needs the base running, and the executor may no longer start anything. So prepare-proof brings up a second stack from a worktree of `base` and passes its URL. |

Verdict: ready — claims: 48 verified / 11 deferred / 0 blocked — spec 565 lines at this verdict

### Validation 2026-11-09, pass 2

Verdict: not ready — claims: 51 verified / 11 deferred / 1 blocked — spec 586 lines at this verdict

Checked against `grixu/cc-toolkit` at `a568d4b`. Rows spot-checked: every row pass 1 added or that rests on a section it edited, plus each row gating a phase; the rest stand on their citations.

| Claim | How it was verified |
|---|---|
| Every `path:line` in the spec resolves | Scripted over the four research files, `risk.ts`, `register.ts`, `evidence.ts`, the test file, `.gitignore`, `lint.yml` and `release.sh`; the two skill files and `briefs/record.md` read whole. |
| W2's ranges hold INFRA-1's list and the copy closes | Each symbol located inside its range; `split`, `halve`, `readDiffs`, `send` and `retryDelay` read, and they need only listed symbols and the constants in INFRA-1. |
| CONFIG-1's required fields and probe | `https://code.claude.com/docs/en/plugins-reference` lists `type`, `title` and `description` as required; the `jq` probe exits 5 on today's file. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500` re-read: one approval on the default branch, owner bypass; first-parent history shows releases on `main`. |
| Regrade, verified to blocking and open: pass 1's "D19 under D43" row | D43 and D19 force only that a base must be running, not that prepare-proof starts it from a worktree, which the user never chose. Step 6 also leaves the worktree's location, its env and dependencies (`briefs/record.md:15`), its removal and a failed base stack undefined, and no section 8 row exercises `before`. |
| Bring-up runs only when a planned kind needs the app | Inference from D43, not separately ratified. The other reading, always starting a stack, costs a terminal-only plan a stack and no decision asks for it. |
| A failed bring-up fails only the kinds that need it | D27 and step 7 applied to step 6, not separately ratified; D2 judges kinds separately. Holds for the checkout's stack; the base stack is the open row above. |
| Non-blocking, closed: D43's "never start" against D15's "by hand as today" | `briefs/record.md:14` has the recorder start a stack by hand, and INTEGRATION-5 already scopes D43 to `record-only`, so nobody had to stop. D43 now says so; the user's question concerned the two new executors. |
| Non-blocking, closed: who writes the screenshot and terminal entries under prepare-proof | Step 8 names only video, and INTEGRATION-3 said "run by hand"; section 4's diagram and G3's wording have the executor writing. INTEGRATION-3 and INTEGRATION-4 now state it. |
| Non-blocking, closed: step 6's two conditional paths had no check | One new row in section 8, INTEGRATION-2 (D27, D43). |
| Non-blocking, left open | `gh` 50-file limit (the help text confirms it), missing media, malformed manifest and empty `files` in INTEGRATION-6, `clean.sh` in the moved `rules.md`, top-level `head` with no reader. Each has more than one fix, and the work proceeds without it. |

After the user's answer on the handed-up repair choice, same pass:

| Claim | How it was verified |
|---|---|
| Blocking, closed: how a `before` shot gets a base stack | The user chose both forms, per run ("1 lub 2 - wybór usera"), recorded as D44. The repair is in INTEGRATION-2 steps 5, 6 and 9, INTEGRATION-3 and three new section 8 rows. |
| A worktree holding install and env files needs `--force` to go | `man git-worktree`, git 2.47.1: only clean worktrees can be removed; unclean ones need `--force`. |
| D44 against D43 | The executor still takes only a URL; only prepare-proof starts the second stack. |
| Worktree path, detached checkout, reuse of a leftover worktree | Chosen while applying D44, not separately ratified; the path sits beside `screenshots/` under D6's directory. Detached because git refuses a branch checked out in another worktree. |

Verdict: ready — claims: 52 verified / 11 deferred / 0 blocked — spec 601 lines at this verdict

### Validation 2026-11-09, pass 3

Verdict: ready — claims: 59 verified / 12 deferred / 0 blocked — spec 625 lines at this verdict

Checked against `grixu/cc-toolkit` at `a568d4b`. Rows spot-checked: every row resting on a section pass 2 edited, plus each row gating a phase; the rest stand on their citations. Git probes ran in throwaway repositories with git 2.47.1.

| Claim | How it was verified |
|---|---|
| Every `path:line` in the spec resolves | Scripted over the cited files, printing each line; `risk.ts:785` and the `SKILL.md` ranges read directly. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: PR with one approval, owner bypass; first-parent history shows releases on `main`. `search_code` for `plugin test` under `.github/workflows` hit only `pytest` and `node --test` steps, so no workflow runs `claude plugin test`. |
| `git worktree remove --force` reaches only a worktree registered in this repository | Probed: a plain directory, the main worktree and another clone's worktree at the same path each exit 128 with contents intact; a locked one needs `-f -f`. So it removes only the registered entry at the exact path, which only prepare-proof writes. |
| Non-blocking, closed: reusing a leftover worktree could pick up a stale checkout | Probed: base advanced and the leftover stayed at its old commit, and `base` is a per-run argument. INTEGRATION-2 step 6 now reuses only a registered path at the base's commit; section 8 has a row. |
| A leftover's checks need both commands, and clearing needs no `git worktree prune` | Probed: a hand-deleted worktree stays in `--porcelain` with its `HEAD`, so `git -C` is what detects it, and `remove --force` clears it. `prune` also dropped an unrelated absent worktree, so step 6 does not use it. |
| Non-blocking, closed: `detached at base` could use a stale or absent local branch | `plugins/dev-kit/hooks/register.ts:292-293` resolves `origin/<base>` first; a probe in a clone with no local `main` refused `main` and accepted `origin/main`. Step 6 now uses that order. |
| The detached checkout is required | Probed: `git worktree add <path> <branch>` refuses a branch checked out elsewhere; `--detach` accepts it. An occupied path fails with `already exists`, so another clone's leftover stays untouched. |
| Non-blocking, closed: empty `files` reaching `git log` | Probed: `git log <a>..HEAD --` with no path listed the commit that an unrelated path did not. INTEGRATION-6 now skips the command, which D14 forces: no files, no commit touched them. |
| Non-blocking, closed: missing media or transcript, malformed manifest | `gh pr edit 999999 --attach ./no-such-file.png` stops on the missing file before any PR lookup; `gh pr create` assumed the same. INTEGRATION-6 applies D27 per entry and INTEGRATION-1's unknown-`version` rule to a manifest `jq` cannot parse. |
| Non-blocking, closed: `clean.sh` named in the moved rules | `plugins/pr-proof/skills/walkthrough-video/templates/clean.sh` is the only one in the plugin. DOCS-1 now scopes the rule and names the other skills' work dir, keeping the move unchanged. |
| Non-blocking, closed: top-level `head` has no reader | INTEGRATION-6 reads only entry `head`s; D13 ratifies the field. INTEGRATION-1 now says nothing compares it. |
| Deferred: the 50-file limit | `gh pr edit --help`, gh 2.103.3, confirms the limit per command, but no fact settles what a repeat does to `./` references to files not attached in it. Declared as G7, confirmed before phase 4. |

### Gap closure 2026-11-10

Not a validation pass: the user closed G1, G2, G3 and G7, and a probe closed G6. Validated by pass 4 below.

| Claim | How it was verified |
|---|---|
| G1, G2, G3 closed as their working assumptions (D45, D46, D47) | The user's answers "G1. A, G2. A, G3. A". |
| G7 closed by overflow comments (D48) | The user's answer "przy tak dużej ilości w paczkach po 50 jako osobne wpisy (komentarze do PRki)". `gh pr comment --help`, gh 2.103.3: `--attach` with up to 50 files per command, `./` references in `--body-file` rewritten to the uploaded asset. |
| Clearing old overflow comments on a re-run (D49) | Assistant-taken while applying D48, not separately ratified. Marker plus viewer authorship limits deletion to pr-open's own comments. |
| An unset `${user_config.KEY}` reaches a skill body as literal text, and `default` is not applied (D50) | Probed on Claude Code 2.1.321 with `--plugin-dir` and with a local marketplace install: `SPEC.research/g6-userconfig-empty-probe.md`. Not observed: the interactive `/plugin` dialog, the Skill tool called by the model, agent bodies. D50's fallback covers a dialog that saves the default. |
| Edits | Header status; section 1 numbering; D16, D22 rationale; D45-D50; gap rows marked closed; CONFIG-1 `screenshot_widths` has no default; API-1 aggregation, INTEGRATION-3 widths and `files`, INTEGRATION-4 `files`, INTEGRATION-6 insert/remove and overflow; W13; section 8 CONFIG-1 row reworded, D40 row trimmed, D45 and D48/D49 rows added; TEST-2. |

### Validation 2026-11-10, pass 4

Verdict: ready — claims: 68 verified / 7 deferred / 0 blocked — spec 667 lines at this verdict

Checked against `grixu/cc-toolkit` at `e20a572` (PR #39 merged after `a568d4b`; it changes only dev-kit's `register.ts`, tests and changelog). Rows spot-checked: every row the gap closure added, every row resting on a section it edited, each row gating a phase, and the citations into `register.ts`.

| Claim | How it was verified |
|---|---|
| Every `path:line` in the spec resolves at `e20a572` | Scripted over the cited lines; only `register.ts` moved (PR #39). The pr-open and `walkthrough-video` lines read directly. |
| Non-blocking, closed: INFRA-1 copied `readDiffs` from `a568d4b`, before PR #39's subdirectory fix | `git diff a568d4b e20a572`: `readDiffs` gains `--no-relative` and `:(top,literal)` (`register.ts:314`). INFRA-1 and the header now pin `e20a572`; W2's `register.ts` ranges shift to `293-321,341-342,346-360,425,469-491`, each end line printed. |
| Non-blocking, closed: API-1's own diffstat and file-list calls would miss the same fix | `register.ts:167-168` pass `--no-relative` to `assess`'s diffs. API-1 now requires it of every `git diff` it runs. |
| D45-D50 against D16, D22, D40 and section 1 | D16 and D22 point at D45 and D46, D45 extends D40 to an existing section, and section 1's numbering covers D45-D50; no silent reversal. |
| D48's contract | `gh pr comment --help`, gh 2.103.3: `--attach`, at most 50 files, `./` rewrite against the body file's directory, unreferenced files appended. `gh pr create --help`: same limit. |
| D49's commands | `gh api --help`: `{owner}` and `{repo}` placeholders fill from the current repository. |
| D50 | `SPEC.research/g6-userconfig-empty-probe.md` read: unset keys stay literal with or without `default`, and a saved `""` substitutes empty. INTEGRATION-3 and section 8's CONFIG-1 row match. |
| Non-blocking, closed: D47's hand-run `terminal-proof` had no check | Only the D44 row ran `screenshot-proof` by hand. The INTEGRATION-4 row now runs by hand and checks the assigned `files`. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: default branch, PR with one approval, user bypass. `lint.yml:16` runs ShellCheck; `search_code` under `.github/workflows` found no `claude plugin test`. |
| Build-order join after the gap closure | W13 now carries D45, D48 and D49, all phase 4; W8 and W9 carry D47, phase 3; TEST-1 covers D46 in phase 1. Nothing moved between phases. |
| Non-blocking, left open: `base` when an executor creates the manifest | D47 and D38 let `terminal-proof` or `screenshot-proof` write first, and neither takes a `base` argument. Nothing compares `base` (INTEGRATION-1), so the work proceeds; default branch or a passed-through argument are both fixes. |
| Edits | Header repository commit and status; INFRA-1 source commit; W2 `register.ts` ranges; API-1 `--no-relative`; section 8 INTEGRATION-4 row. |

Follow-up edits after pass 4, not re-validated: the `base` row above is closed in INTEGRATION-1 (the creating writer sets it; a hand-run executor uses the default branch); INTEGRATION-6 names `gh api user --jq .login` as the viewer's login for D49, which an Actions or App token would not return, so D49 assumes a user token; `default` confirmed optional for a `userConfig` option (`https://code.claude.com/docs/en/plugins-reference`, the user-configuration field table: `default` Required "No").

### G4 and G5, 2026-11-10

Not a validation pass. G4: the user chose measurement over an upfront call ("G4. C"); its placement row now says phase 2 keeps the better-agreeing variant. G5: the user chose a probe ("G5. B"), run on their account with `claude -p --plugin-dir` on Claude Code 2.1.322 (`SPEC.research/g5-tool-duration-probe.md`): no cap up to 1200 s for time inside `$.process.run`; `$.clock.sleep` cut off at the 10 s hook budget. Recorded as D51, whose process-based retry wait is assistant-taken. Not observed: past 1200 s, interactive sessions, one long `$.http.fetch`, result size. Edits: D51, G5 row, API-1 limits, companion list.

### Validation 2026-11-10, pass 5

Verdict: ready — claims: 76 verified / 7 deferred / 0 blocked — spec 699 lines at this verdict

Checked against `grixu/cc-toolkit` at `c738263` (the dev-kit 0.8.1 release after `e20a572`; it touches only versions and the changelog). Rows spot-checked: every row the G4/G5 closure and pass 4's follow-up edits rest on, each row gating a phase, and the `register.ts` citations.

| Claim | How it was verified |
|---|---|
| Every `path:line` in the spec resolves at `c738263` | Scripted over `register.ts`, `risk.ts`, `paths.ts`, `evidence.ts`, the test file, `.gitignore`, `lint.yml`, `release.sh` and the research files; the two skill files and `briefs/record.md` read at the cited lines. |
| D51's `.catch` and unavailable shape | `plugins/dev-kit/hooks/register.ts:146` holds the `.catch(($, e, next) => unavailable(...))`; `:149-151` the result shape. |
| D51's process-based wait fits `$.process.run` | `SPEC.research/cc-plugin-platform.md:136`: 30 s default timeout; `MAX_RETRY_DELAY_MS` is 10,000 (`plugins/dev-kit/hooks/risk.ts:26`). |
| D51's "about 220 s" | Arithmetic: 3 fetches of 30 s plus 2 waits of 10 s is 110 s a part; 8 parts at `CONCURRENCY` 4 is two rounds. |
| Non-blocking, closed: D51's worst case ignored halving | `register.ts:379-385` asks a part's halves in sequence, so 64 leaves at 4 in flight give about 1,760 s, past the 1,200 s probe. A 72,000-char state at 2.7 chars/token fits Jev's 32k limit, so halving is rare; D51 now states both bounds. |
| Non-blocking, closed: INFRA-1 copied `send` verbatim while API-1 changes it | `register.ts:483` calls `$.clock.sleep`; only API-1 (W3) said to replace it, and W3's files omit `jev.ts`. INFRA-1's `send` now carries D51's wait. |
| Non-blocking, closed: section 1's numbering stopped at D50 | D51 was added on 2026-11-10 without a numbering line; section 1 now names it. |
| Pass 4's follow-up edits | `default` optional and `gh api user --jq .login` read as stated; `gh repo view --json defaultBranchRef` gives the default branch. |
| Non-blocking, left open: `base` when an executor under prepare-proof creates the manifest | INTEGRATION-1 sets `base` from prepare-proof's argument or, run by hand, the default branch; D38 has `terminal-proof` write first and INTEGRATION-2 writes no manifest before step 7. Creating it early would turn "all failed" into D40's "no proof"; passing `base` to the executors is the other fix. Nothing compares `base`. |
| Deferred | G4 to phase 2 (TEST-2); G5's result-size half to TEST-2's largest PR; five section 10 items, each with owner and placement. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500` re-read: default branch, PR with one approval, signed commits, user bypass. `git diff --stat e20a572 c738263` touches no workflow. |
| Build-order join | W2 now carries D51's `send`, phase 1 with W3; nothing moved between phases. W2's `register.ts:469-491` holds `post` and `send` (475-485). |
| Non-blocking, closed: D51's `sleep` argument unstated | `retryDelay` returns milliseconds and can be fractional (`risk.ts:896-900`, `retry-after` times 1000). API-1 now gives `String(ms / 1000)`, `timeoutMs: 30_000` (above the 10 s cap) and an ignored exit code. `sleep 0.25` and `sleep 1.2345` ran for 0.25 s and 1.24 s on macOS; GNU `sleep` accepts decimals as well. |
| Non-blocking, closed: no check exercised D51 | Section 8 had no row for the retry wait. TEST-1 and a probe row now cover a `503` followed by a `200`, through the `process.run` mock that `plugins/dev-kit/tests/pr-risk.test.ts:115-121` already uses. |
| INTEGRATION-6's viewer login | `gh api user --jq .login` returns the user's login for a user token. D49's user-token assumption holds because `pr-open` runs in a user's session, never in Actions. |

Follow-up edit after pass 5, not re-validated: the one non-blocking item pass 5 left open, `base` when an executor writes the manifest first under prepare-proof, is closed by passing `base` alongside the URLs and `files` (INTEGRATION-2 step 7, INTEGRATION-1); both executors gain an optional `[base]` argument defaulting to the default branch. Assistant-taken, following D43.

### Validation 2026-11-11, pass 6

Verdict: ready — claims: 91 verified / 5 deferred / 0 blocked — spec 754 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `c738263` (HEAD equals `origin/main` after `git fetch`; no drift since pass 5). Rows spot-checked: every row the 2026-11-11 amendment added, the `base` follow-up, each row gating phase 4, and the landing rows; code rows from pass 5 stand, the tree being unchanged.

| Claim | How it was verified |
|---|---|
| Every new `path:line` resolves | Read `plugins/dev-kit/evals/reset-sandbox.sh`, `gh-stand-in.sh`, `checks/pr-open.mjs`, `promptfooconfig.yaml:160-210`, `provider.mjs`, `scripts/run-evals.sh`, pr-proof's `plugin.json` and `.claude-plugin/marketplace.json:205-228`; each cited line says what the spec claims. |
| D52 and D53 come from the notes | `SPEC.notes.md` section 3a: R33 with "Tak, dopisz do specu", and the descriptions item moved into DOCS-2; section 1's numbering covers D52-D55. |
| D54's path is the one INTEGRATION-1 computes in the sandbox | Origin `.sandbox/pr-open-proof-origin.git` (`reset-sandbox.sh:89`) gives `pr-open-proof-origin`; `feat/checkout-summary` encodes to `feat%2Fcheckout-summary`. |
| D55 covers every stand-in call INTEGRATION-6 makes | `pr create`, `pr edit`, `pr comment`, `pr view` (reads `pr.json`, which D55 rewrites), `api user` (line 240), the comment listing once `{owner}`/`{repo}` expand (line 288), and `DELETE` (line 303 refuses it today). |
| The `base` follow-up is consistent | INTEGRATION-1's `base` bullet, INTEGRATION-2 step 7, INTEGRATION-3 and INTEGRATION-4 arguments agree; step 8 writes the video entry with the run's `base`. Dropped: passing `base` to `walkthrough-video`, which ignores it, blocks nothing. |
| Non-blocking, closed: TEST-3's fixture named no PR template | `proof` runs `bodyChecks`, which require Issue, Description and Dependencies (`checks/pr-open.mjs:22,55`); both new-PR cases carry them in `base/.github/pull_request_template.md`. TEST-3 now names it. |
| Non-blocking, closed: TEST-3 counted `pr create` over the whole `gh-calls.log` | Every scenario of a trial shares the log (`gh-stand-in.sh:11,147`; `checks/security.mjs:158`), so `pr-open-feature` and `pr-open-no-ticket` add two more. The check now counts lines run in `.sandbox/pr-open-proof`. |
| Non-blocking, closed: section 8's `pr-open` run named three cases | `--filter-pattern pr-open` (`scripts/run-evals.sh:197-205`) also matches `pr-open-proof`; the row now says so. |
| The eval sandbox can read `~/.cache/pr-proof/` | Was inference; `https://code.claude.com/docs/en/sandboxing` lists reads as "most of the machine", and `scripts/evals-isolation.json` denies no `~/.cache` path. Section 12's row updated. |
| `mktemp -d` works under the eval sandbox | pr-open already runs `mktemp -t` (`plugins/dev-kit/skills/pr-open/SKILL.md:113`) in the three passing cases; the sandbox's writes include a per-user temp directory (same docs page). |
| No workflow runs dev-kit evals | All five workflow bodies read: only `fd3-evals.yml:77` calls `run-evals.sh`, with an fd3 pattern. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: default branch, active, pull request, signed commits, user bypass. |
| Build-order join after the amendment | W15 reads only a fixture manifest and W13's skill text, both phase 4 in one PR (D52); W12 is phase 3 and touches only manifests and docs. Nothing moved between phases. |
| Deferred | G4 to phase 2 (TEST-2); G5's result-size half to TEST-2's largest PR; the three section 10 items, each with owner and placement. |
| Edits | Header status; TEST-3 fixture and `proof` bullets; section 8 TEST-3 row; section 12's sandbox-read row. |

### Validation 2026-11-11, pass 7

Verdict: ready — claims: 91 verified / 5 deferred / 0 blocked — spec 770 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `c738263` (HEAD equals `origin/main` after `git fetch`; the spec was 754 lines, as pass 6 left it). Rows spot-checked: the four body edits pass 6 applied, each row gating phase 4, and the landing rows; the rest stand on pass 6's evidence, the tree being unchanged.

| Claim | How it was verified |
|---|---|
| TEST-3's fixture template matches the other pr-open cases | `cases/pr-open-feature`, `pr-open-no-ticket` and `pr-open-update-body` each hold `base/.github/pull_request_template.md`; `checks/pr-open.mjs:22` lists Issue, Description and Dependencies, and `bodyChecks` (line 51) requires each, in that order (line 55). |
| TEST-3's `pr create` count can be scoped to its own checkout | `gh-stand-in.sh:11` logs every call as `<args> # in <PWD>`, so a line run in `.sandbox/pr-open-proof` carries its `--attach` arguments and that directory. The other cases use other branches (`feat/PL-5880-admin-notes`, `fix/popover-click-close`, `feat/PL-5820`), so the `gh-posted-pr-create-feat-checkout-summary.md` copy (`gh-stand-in.sh:141`) is TEST-3's alone. |
| The `pr-open` pattern runs four cases | `scripts/run-evals.sh:197-205` passes the argument as `--filter-pattern`; the three existing descriptions start `pr-open-` (`promptfooconfig.yaml:175,188,199`), and `pr-open-proof` matches too. |
| The eval sandbox can read `~/.cache/pr-proof/` | `https://code.claude.com/docs/en/sandboxing`, the access table, re-read: Reads default to "Most of the machine". `scripts/evals-isolation.json` read whole: its read denies and credential files name no `~/.cache` path. |
| Landing for TEST-3 | `reset-sandbox.sh:86` is the pr-open loop and line 106 its `done`, where W15's block goes; no workflow change is needed (section 5). |
| Deferred | G4 to phase 2 (TEST-2); G5's result-size half to TEST-2's largest PR; the three section 10 items, each with owner and placement. |
| Dropped | Section 12's original "No workflow runs dev-kit evals" row says the other four workflows' bodies were not read; pass 6's block records that they were. The later dated row is the record and the claim holds, so nothing blocks. |

### Validation 2026-11-11, pass 8

Verdict: ready — claims: 91 verified / 5 deferred / 0 blocked — spec 787 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `836deea` (`origin/main` after `git fetch`, the merge of PR #40; the local checkout is at `c738263`, so files were read with `git show origin/main:<path>`). Rows spot-checked: every citation into a file `c738263..836deea` changed, the claims resting on `release.sh`, and the landing rows; the rest stand on pass 7's evidence, since no other cited path changed.

| Claim | How it was verified |
|---|---|
| Only two cited paths changed since `c738263` | `git diff --name-only c738263 origin/main` lists `.claude-plugin/marketplace.json`, `scripts/release.sh`, `.claude/skills/release/SKILL.md`, `brand/`, `docs/DESIGN.md` and `docs/brand/`; none under `plugins/`, `.github/` or `docs/specs/`. The spec cites none of the last four. |
| Non-blocking, closed: marketplace citations off by one | A top-level `"version": "1.0.0"` at line 4 moves pr-proof's `description` to line 213 and its `tags` to 220-226. D53, W12 and section 12's descriptions row now cite them, read at `836deea`. The content holds: one description naming only the video, the same text as `plugin.json:3`; tags without `screenshots`, `terminal`, `api`. |
| Non-blocking, closed: `release.sh` citation off by two | The `[Unreleased]` comment moved from line 21 to 23 (the enforcement is lines 101-108). Section 12's row now cites 23. |
| D53's "`release.sh` bumps it" and section 7's `./scripts/release.sh pr-proof minor` | `scripts/release.sh` at `836deea` still bumps the plugin's `version` in `plugin.json` and its marketplace entry, and also bumps the marketplace's top-level `version` by the same level and tags `marketplace/vX.Y.Z`. DOCS-2 changes no `version`, so both claims hold; the new `die` on a missing top-level version cannot fire, since line 4 holds one. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: active on the default branch, pull request, signed commits, user bypass. No workflow changed since `c738263`. |
| Build-order join | No edit moved a work item; the join pass 7 walked stands. |
| Deferred | G4 to phase 2 (TEST-2); G5's result-size half to TEST-2's largest PR; the three section 10 items, each with owner and placement. |
| Edits | Header status; D53's and W12's marketplace lines; section 12's `release.sh` and descriptions rows. |

### Validation 2026-11-11, pass 9

Verdict: ready — claims: 91 verified / 5 deferred / 0 blocked — spec 800 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `836deea` (`origin/main` after `git fetch`, unchanged since pass 8; the local checkout is at `c738263`, so files were read with `git show origin/main:<path>`). Rows spot-checked: the four citations pass 8 corrected and the landing rows; the rest stand on pass 8's evidence.

| Claim | How it was verified |
|---|---|
| Pass 8's corrected citations resolve | `.claude-plugin/marketplace.json:213` is pr-proof's `description` and `:220-226` its `tags` list, `[` to `]`; `scripts/release.sh:23` is the `[Unreleased]` requirement. `plugins/pr-proof/.claude-plugin/plugin.json:3` holds the same description text and `:10-17` the `keywords`, none of them `screenshots`, `terminal` or `api`. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: active on the default branch, pull request, signed commits, user bypass. `git diff --name-only c738263 origin/main` under `plugins`, `.github`, `docs/specs` and `scripts` lists only `scripts/release.sh`, which pass 8 read. |
| Build-order join | No edit since pass 8 moved a work item; the join stands. |
| Deferred | G4 to phase 2 (TEST-2); G5's result-size half to TEST-2's largest PR; the three section 10 items, each with owner and placement. |

### G4 closure, 2026-11-11

Not a validation pass. The user accepted the phase-2 result during `fd3:implement-tasks` ("Accept, amend spec", Q3 review-g4-commit-variant; `SPEC.notes.md` section 3a): the state without commits, and the tuned FACTS wording. Read against `feat/prepare-proof` at `5b8363a` (PR #42) and the git-ignored `plugins/pr-proof/evals/proof-signals/local/g4-variant.md`. Edits: header status; D22; the declared-gaps lead and G4 row; INFRA-1's diff-budget sentence; API-1's state and FACTS; two section 12 rows reworded, one added.

### Validation 2026-11-12, pass 10

Verdict: ready — claims: 97 verified / 3 deferred / 0 blocked — spec 829 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `836deea` (`origin/main` after `git fetch`, unchanged since pass 9; the local checkout is at `c738263`), `feat/prepare-proof` @ `f2bbbe6` (PR #42; after `5b8363a` only `mask.sh` changed). Rows spot-checked: every row and section the G4 closure edited, the G5 row, the landing rows; the rest stand on pass 9's evidence.

| Claim | How it was verified |
|---|---|
| The G4 closure's citations resolve | `plugins/pr-proof/hooks/register.ts:29` is `DIFF_CHAR_BUDGET = STATE_CHAR_BUDGET - DIFFSTAT_CHAR_BUDGET`, used at lines 90-91; `signals.ts:6-15` holds FACTS, word for word API-1's block; `signals.ts:44-54` is `partState`'s comment through `commits: ''`; `risk.ts:601-617` at `e20a572` is `pr_risk`'s `partState`, with no commits. |
| D22's figures and INFRA-1's 68,000 | `g4-variant.md:10`, the final wording row: 96 / 5 / 11 at 0.078 without commits, 94 / 7 / 11 at 0.089 with them; 72,000 - 4,000 is 68,000. `jev.ts:5` defines `COMMITS_CHAR_BUDGET` and nothing reads it, as INFRA-1 says; kept by the user's choice. |
| The acceptance behind D22 and FACTS | `SPEC.notes.md` section 3a records "Accept, amend spec" for Q3 and the tuned wording; 96 and 79 of 112 cells are its 86% and 71%. |
| No other section still sends commits | Every `commits` in the spec read: INFRA-1's constant comment matches `jev.ts:4`, and `git log` appears only in INTEGRATION-6's staleness check. |
| Non-blocking, closed: G5's result-size half read "stays unprobed" | `plugins/pr-proof/evals/proof-signals/local/g5-result-size.md:3-5` (git-ignored, main checkout): 531-545 bytes over all 28 PRs, both 8-part PRs included. The G5 row and the declared-gaps lead now record it closed. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: active on the default branch, pull request, signed commits, user bypass. `gh pr view 42`: `feat/prepare-proof` into `main`, open, the one PR for phases 1-3. |
| Build-order join | The G4 closure moved no work item; W5 still lands only the wording commit in phase 2. |
| Deferred | The three section 10 items, each with owner and placement; G4 and G5 are now closed. |
| Edits | Header status; the declared-gaps lead and G5 row. |

### Validation 2026-11-12, pass 11

Verdict: ready — claims: 98 verified / 3 deferred / 0 blocked — spec 847 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `5a13729` (`origin/main` after `git fetch`: PR #42 merged as `fd3c5c9`, PR #43 as `5a13729`; the local checkout is at `c738263`, so files were read with `git show`). Rows spot-checked: the two body edits pass 10 applied, every citation into a file `836deea..5a13729` changed, the landing rows; the rest stand on pass 10's evidence.

| Claim | How it was verified |
|---|---|
| G5's result-size half closed | `plugins/pr-proof/evals/proof-signals/local/g5-result-size.md:3-5` (git-ignored, main checkout): fixed-shape JSON, 531-545 bytes over all 28 PRs and every arm, both 8-part PRs 537-538 bytes. The G5 row matches. |
| Non-blocking, closed: the declared-gaps lead omitted G5's duration half | It listed the 2026-11-10 closures as G1, G2, G3, G6 and G7 and named only G5's result-size half, while the G5 row and section 1 close its duration half by D51 on 2026-11-10. The lead now names it. |
| Citations into files the implementation changed | 33 of 61 cited `path:line`s point into files PRs #42 and #43 changed. Each states the pre-change state and resolves at its stated baseline: `e20a572` (header) for the skills, evals and `plugin.json`; `836deea` for `marketplace.json` and `release.sh` (section 12 and pass 8). Not rewritten against `5a13729`, which would make them describe the implementation. `git diff --name-only e20a572 836deea` touches no cited file but those two. |
| As-built citations hold on `main` | `git diff --stat 5b8363a origin/main -- plugins/pr-proof/hooks/` is empty; `register.ts:29`, `signals.ts:6` and `signals.ts:44-54` read as cited. |
| `fd3-evals.yml:1,8-9` after `3b00765` | That commit moves the pnpm setup only (lines 38-50); line 1 is the name and lines 8-9 the `plugins/fd3/**` filter, so no workflow runs dev-kit evals. |
| Landing claims in section 5 and D29's order | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: active, pull request, signed commits, one bypass actor. `gh pr view 42` and `43`: `feat/prepare-proof` merged 10:19:00Z, `feat/pr-open-proof` 10:19:11Z, both into `main`, so phase 4 merged after phase 3. On `main` pr-proof is still 0.1.0 and dev-kit 0.8.1: the phase-3 release and section 10's dev-kit release have not run. |
| Build-order join | No edit moved a work item; the join stands. |
| Deferred | The three section 10 items, each with owner and placement. |
| Edits | Header status; the declared-gaps lead. |

### Validation 2026-11-12, pass 12

Verdict: ready — claims: 101 verified / 0 deferred / 0 blocked — spec 864 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `a51f464` (`origin/main` after `git fetch`, local checkout equal; after `5a13729` only the two release commits). Rows spot-checked: the declared-gaps lead pass 11 edited, section 10's three items, every citation into a file `5a13729..a51f464` changed, the landing rows; the rest stand on pass 11's evidence.

| Claim | How it was verified |
|---|---|
| The declared-gaps lead matches the gap rows and the decisions | G1, G2, G3, G6, G7 against D45, D46, D47, D50, D48 (G7's row adds D49, which follows D48); G5's duration half by D51 on 2026-11-10, as the G5 row and section 1 say; G4 and G5's size half on 2026-11-11, as their rows say. |
| Non-blocking, closed: section 10's dev-kit release item read as pending | `a51f464` `release: dev-kit v0.9.0`, tag `dev-kit/v0.9.0`, `plugin.json` 0.9.0. Its placement now records it done. |
| Non-blocking, closed: section 10's eviction item read "decide after the first release" | `SPEC.notes.md` section 3a, 2026-11-12: no eviction rule, after pr-proof 0.2.0 (`45d2280`, tag `pr-proof/v0.2.0`, a minor bump as section 7 plans). The notes' next bullet, "stays decide after the first release", is the 2026-11-11 record that this one supersedes. |
| Non-blocking, closed: section 10's `pr_risk` context item read "decide at the phase-4 review" | `implement-answers.md`, round 1 of 2026-11-11, Q6: "No", the manifest does not feed `pr_risk`; task `0019` is `done`. Passes 10 and 11 carried it as deferred without reading that record. |
| Citations into files the releases changed | `git diff --numstat 5a13729 a51f464`: `marketplace.json` and both `plugin.json` change version lines in place, the changelogs add two lines each; no cited line moves, and section 12 cites them at `836deea` and `e20a572`. |
| Landing claims in section 5 | `gh api repos/grixu/cc-toolkit/rulesets/17680500`: active, pull request, signed commits, one bypass actor. Both releases are first-parent commits on `main` after PR #43's merge, by `release.sh` as section 5 says. |
| Build-order join | No edit moved a work item; the join stands. |
| Edits | Header status; section 10's three placements. |

### Validation 2026-11-12, pass 13

Verdict: ready — claims: 101 verified / 0 deferred / 0 blocked — spec 879 lines at this verdict

Checked at: `grixu/cc-toolkit` @ `a51f464` (`origin/main` after `git fetch`, unchanged since pass 12; local checkout equal). `SPEC.notes.md` and `implement-answers.md` are untracked under `docs/specs/` and were read from the working tree. Rows spot-checked: section 10's three placements pass 12 rewrote, and the `SPEC.notes.md` section 3a line pass 12 found in conflict; the rest stand on pass 12's evidence, since no other section changed.

| Claim | How it was verified |
|---|---|
| Section 10's dev-kit release placement | `a51f464` is `release: dev-kit v0.9.0`; the annotated tag `dev-kit/v0.9.0` points at it; `plugins/dev-kit/.claude-plugin/plugin.json` there reads 0.9.0. Task `0021-release-dev-kit` exists. |
| Section 10's eviction placement | `SPEC.notes.md` section 3a, line 71: no eviction rule, 2026-11-12, pr-proof 0.2.0 released the same day; tag `pr-proof/v0.2.0` points at `45d2280`. Line 72 now marks the item "since settled", so the notes no longer disagree with themselves. Task `0016` is `done`. |
| Section 10's `pr_risk` context placement | `implement-answers.md`, round 1 of 2026-11-11, Q6: "No", the manifest does not feed `pr_risk`; task `0019` is `done`. The row's citation `plugins/dev-kit/skills/pr-open/SKILL.md:33` is the **Risk** bullet at `e20a572` and still at `a51f464`. |
| Section 10's lead against its rows | "None of it was ratified" reads as scope: all three items stay outside the work items, two decided as "no" and the release run outside W1-W15, so none is work the spec does (check 2). |
| Build-order join | No edit moved a work item; the join stands. |
| Edits | Header status. |

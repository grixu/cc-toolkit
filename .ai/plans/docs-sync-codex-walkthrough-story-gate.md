# Docs sync: walkthrough profile, code-review on Codex, proof label and story gate

Bring the docs site (`docs/src/content/docs/`, EN and `pl/`) up to the plugin sources after the last
docs update (`6dae33a2`). Three merged changes reached no docs page:

| Change | Released as | Source of truth |
|---|---|---|
| #59 walkthrough repo profile, title card, MP4 checks | pr-proof 0.5.0 | `plugins/pr-proof/README.md`, `skills/walkthrough-video/` |
| #32 code-review on OpenAI Codex CLI | code-review 0.10.0 | root `README.md` § OpenAI Codex CLI, `plugins/code-review/README.md` § Codex |
| #61 proof label, code story gate; code-story craft rule | dev-kit 0.12.0, code-story 0.2.0 | `plugins/dev-kit/README.md`, `skills/pr-open/SKILL.md`, `plugin.json`; `plugins/code-story/.../craft.md` |

The changelog page needs nothing: `Releases.astro` reads every `CHANGELOG.md`.

Rules for every step:
- Each EN change gets its PL twin in the same commit, at the same place in `pl/…`, written the way the
  existing PL pages are (not a word-for-word translation).
- Every fact is checked against the source named above, not against this plan.
- Style follows the neighbouring page: one sentence per line, `SkillFlow` for flows, numbered tables
  (`Table N.`), links as `/plugins/...` paths.

## 1. pr-proof: walkthrough-video (#59)

Commit: `docs(pr-proof): walkthrough repo profile, title card and MP4 checks`

`plugins/pr-proof/walkthrough-video.mdx` + `pl/plugins/pr-proof/walkthrough-video.mdx`:

- [x] **How it runs** — `SkillFlow`: the Requirements step mentions the repo-profile leg on a
      repository's first walkthrough. Scenario says scene 0 is the title card and the story opens with
      the why. Report lists the scenes with their times. Delivery mentions the over-10 MB question.
      The paragraph under it: five subagents, six on a repository's first walkthrough.
- [x] **New section "The repo profile"** (after "How it runs"):
      `~/.cache/walkthrough-video/<repo>/repo-profile.md`, what it holds (stack start and ports,
      login, success/error toast selectors, overlays, shared services), written on the first run,
      corrected by the recorder after each good take, uses the project's own skills (start the stack,
      seed, log in), and how to reset it (edit or delete the file).
- [x] **Scenario / title card** — the title card shows the PR number and the change in plain words,
      so the PR player's poster names the change. It is an overlay on the first scene's route, so what
      prepare set up stays in place. The validator checks the story's order.
- [x] **Recording checks** — `frames.sh` warns on anything other than one video stream at 30 fps,
      or a file over 10 MB (GitHub free-plan limit).
- [x] **Delivery** — before attaching a video over 10 MB, the skill asks: faster re-render, lower
      resolution (keeps the pace, no new take), or attach as is.
- [x] **Retake after fixes** — feedback by scene number, player time or a caption's words, mapped
      through `out/cues.txt`. "Too fast" for the whole video is only a re-render.
      — Changed: the section is now "Feedback and retakes" with a feedback table; `frames.sh` writes
      `out/frames/cues.txt`, not `out/cues.txt`.
- [x] **What it leaves** — Table 1 gets `out/cues.txt`, plus a line that `repo-profile.md` sits one
      level up and is shared across walkthroughs, so it survives delivery.
- [x] **What can go wrong** — the stack bullet: the profile and the project's skills come first,
      then `CLAUDE.md`.
- [x] `plugins/pr-proof/reference.md` (+ PL): add the profile and `cues.txt` paths if the page lists
      files. Check against `video_speed` / re-render wording.

## 2. code-review on Codex (#32)

Commit: `docs(code-review): install and run code-review on OpenAI Codex CLI`

- [x] **`getting-started/installation.md`** (+ PL): new section "OpenAI Codex CLI": the two
      `codex plugin` commands, starting with `$code-review:start-cr`, that only code-review ships
      Codex adapters (Codex lists the other plugins too, but they are unsupported), and a link to the
      new page.
- [x] **New page `plugins/code-review/codex.md`** (+ `pl/…/codex.md`), `group: reference`, sidebar
      order after Reference. Sections:
      - Install and update (marketplace add, `--ref <branch>`, `codex plugin list`, a local checkout as
        the marketplace, re-run `codex plugin add` after an edit), tested on codex-cli 0.165.0, needs
        `git` and `python3`.
      - Run it: `$code-review:start-cr [--base] [--pr] [--spec]`. `start-cr`, `cr-prepare`, `cr-scan`
        and `cr-merge` run only when mentioned.
      - How it works: `.codex-plugin/plugin.json` → `codex/skills/` thin adapters → `codex/host.md`
        maps Claude Code mechanics → canonical bodies unchanged, so lens rules have one source.
      - Limits: lens waves and `agents.max_concurrent_threads_per_session` (v1: 6, v2: slots − 1,
        3 by default). Questions as numbered chat messages. `codex exec` stops at every question and
        continues with `codex exec resume <id> "<answer>"` (no `-C`/`-s`). Commits blocked by a
        read-only `.git` and the gpg socket (writable_roots fixes only `.git`; never disables signing
        or hooks). `--pr` needs network and is untested. Scanners get the full toolset. No
        `/security-review` or `/code-review`. Walk decision backend unavailable. Cost figure
        (2026-10, one-file change, ten lenses: 3.5–4 min, ~5M input tokens, ~95% cached, 20k output).
- [x] **`plugins/code-review/index.mdx`** (+ PL): one line under "Requirements" or "What's in the
      plugin" that it also runs in Codex, with a link to the page.
- [x] **`plugins/code-review/start-cr.mdx`** (+ PL), "Let a model answer walk questions": one
      sentence that under Codex every structural fix is asked one at a time.
- [x] Check `docs/src/lib/nav.ts` / `groups.ts`: does a new page under a plugin need an entry, or
      does the sidebar pick it up from frontmatter?

## 3. dev-kit and code-story (#61)

Commit: `docs(dev-kit): proof label and code story gate`

`plugins/dev-kit/pr-open.mdx` (+ PL):

- [x] **Fix the wrong statement**: the `SkillFlow` "Check" step says the code story starts there.
      Move the start: with `auto`, after the description is drafted and the gate says yes; at once
      with `always` or for a PR whose description already links a story.
- [x] **The proof from pr-proof** — new bullet: the `proof` label while the section shows at least
      one entry and none is stale or after rewritten history. A later run that finds stale proof
      removes it. Without a manifest on the machine the label stays as it is. Options `proof_label`
      and `proof_label_name`. The "Open" step `leaves` gets the proof label.
- [x] **The code story** — new subsection "Whether a change gets a story": `story_signals`
      (`mcp__dev-kit__story_signals`), what is sent (diff, diffstat, commits, drafted title and
      description without Code story/Proof/Risk), the 13 questions (9 skip, 4 story), the skip rule,
      the `code_story` table (`auto` / `always` / `never`), `story_gate_backend`, fail-open (no key,
      tool failure, diff too large → story written), log `~/.cache/dev-kit/story-gate.jsonl`
      (without the diff), and the calibration result with its caveat (37 + 24 PRs, one person's
      judgement; none of the 11 story PRs skipped).
- [x] **What leaves your machine** — the gate sends the diff to Jev/Gemini. Say it next to the risk
      label's statement, so nobody reads "nothing is sent" as covering the gate.
      — Placed in `dev-kit/index.mdx`, where that statement lives; pr-open's gate subsection lists
      what is sent.
- [x] **When the pull request already exists** — the proof label is refreshed. A linked story is
      always updated, whatever the gate says.
      — Changed: except under `code_story: never`, which `pr-open` checks first.
- [x] **What it leaves / report** — the proof label added, removed or left alone. The story status
      `off` or `skipped (<reason>, decided by <backend>)`.
- [x] **What can go wrong** — "The gate skipped a story you wanted": set `code_story` to `always`
      or re-run after the description says more.
- [x] **Options** — add `code_story`, `story_gate_backend`, `proof_label`, `proof_label_name` to
      `plugins/dev-kit/reference.md` (+ PL) in a new "Plugin options" section, linking to the risk
      label's option table for the rest. The risk reference page keeps only risk options.
- [x] `plugins/dev-kit/index.mdx` (+ PL): the pr-open row in the skills table mentions the proof
      label and that plain changes get no story.

Commit: `docs(code-story): quote the hidden cause and what the change makes simpler`

- [x] `plugins/code-story/code-story.mdx` (+ PL), in the part about what a chapter holds: a fix
      whose cause sits in unchanged lines quotes those lines. A change that makes code elsewhere
      redundant shows one real caller before and after, quoted from the file, and says whether this
      branch removes it.
- [x] `plugins/code-story/index.mdx` (+ PL): one line that pr-open may skip the story for a plain
      change, with a link to the gate subsection.

## 4. Verify

- [x] `pnpm -C docs build` passes with no new warnings, and the new Codex page shows in both
      sidebars.
- [x] Every new link resolves (the build's link check, or open the built pages).
      — A script over `dist/` checked every in-page link and anchor on the 22 changed pages: 0 broken.
- [x] `/compound-writing:cw-ai-check` on the new EN sections; the PL sections read like the other
      PL pages. — Ran `/anti-slop:anti-slop` instead, on the added lines in EN and PL: cut two
      unsupported reasons and an invented reader use, a run-up, a calque ("outlives", "żyje") and
      bold labels in the gate's question list.
- [x] Cold read of the pr-open page as a user who only knew the old story-always behaviour.
      — Done after #63 merged, with cw-reader. Fixed in EN and PL: two passages still described
      the story as always starting at Check, the undefined "gate", the "always … except never"
      sentence, a repeated sentence, unexplained thresholds and averaging, the bare "Jev", the
      proof label's default and its other-machine case, and no pointer to the 0.12.0 change.

## Out of scope

- No plugin source changes.
- No new descriptions in `plugin.json` or `marketplace.json`.

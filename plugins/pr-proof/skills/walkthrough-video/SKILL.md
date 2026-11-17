---
name: walkthrough-video
description: Record a narrated walkthrough video of a built feature or a PR's change with playwright-recast, from its spec or from requirements reconstructed out of the code, and attach it to the PR once the user accepts it. Use when asked for a demo, walkthrough, feature video or video proof, or to re-record one after fixes, whether the user asks directly or another agent dispatches it.
---

`/pr-proof:walkthrough-video [feature, spec path or PR] [who watches and what they asked to see] [record-only]`

A **walkthrough** is one Playwright test that tells a feature's story scene by scene against the running app, rendered by playwright-recast into an MP4 with burned-in captions. You are the orchestrator of a **relay**: five legs, six on a repository's first walkthrough, each a fresh subagent handed one brief from `briefs/` and the files earlier legs wrote. Files are the only hand-off, so each leg sees only its own brief and its own finish line, the validator stays independent of the writer, and the recorder's long run stays out of your context.

The viewer must be able to follow every beat: see what is clicked, read what is typed, read every caption, if need be by pausing. The take is always recorded at a **calm** pace, the bar every leg is held to; the configured speed only shortens the rendered video, so changing it is a re-render, never a new take. Length follows the story, never the other way round.

## Inputs

Settle these from the arguments and the conversation; look up what is missing; ask only for what neither yields:

- **Feature and checkout**: the worktree or branch where the feature is built, and its PR if there is one.
- **Scope**: with a PR or branch, the video shows **what that change made different** for a user; behaviour the change left alone stays out unless the user asks for the whole feature. Without one, the whole feature.
- **Spec**: a path when given; otherwise the requirements leg searches for one.
- **Audience and focus**: who watches and what they asked to see. Default: a product reviewer.
- **Credentials**: where the local test users' credentials live (an e2e credentials file, usually). Pass the path, never a value.
- **Stack**: how this project runs locally, and which local actions reach shared or external services, from its `CLAUDE.md` files and the repo profile. Pass both on to every leg.
- **Speed and caption density**, from the pr-proof options. Each is the option's text when that is non-empty and does not still start with `${user_config.`, since an unset option reaches this skill literally; otherwise its default. A user who names a speed or density for this run overrides both.
  - Speed: `${user_config.video_speed}`, one of `0.5x`, `1x`, `2x`, `3x`, `5x`; default `1x`. The render plays the calm take at speed ÷ 0.5 times its real pace: `0.5x` is the recorded pace, `5x` ten times faster.
  - Caption density: `${user_config.caption_density}`, one of `normal`, `2x`, `4x`; default `normal`. A caption holds at most 60 × density characters and 12 × density words (normal 60, 2x 120, 4x 240), set in smaller type covering the same area.

  Pass both to every leg; the recorder exports them as `SPEED` and `CAPTION_DENSITY`.

Work dir: `~/.cache/walkthrough-video/<repo>/<feature-slug>/`, never under the session scratchpad or `/tmp`: a reboot wipes those, and the legs' hand-off files and videos must survive one. Legs write `requirements.md`, `recast-notes.md`, `scenario.md`, `recast/` (code), `teardown-ledger.jsonl` (reverts still owed), `stack.log` and `out/` (video, captions, frames) there. When the work dir already exists, read what it holds and resume after the last leg whose finish line it meets; never re-ask a decision recorded under `## User decisions` in `requirements.md`.

Repo profile: `~/.cache/walkthrough-video/<repo>/repo-profile.md`, beside the work dirs and shared by every walkthrough in the repo. It records how the app starts, logs in and shows success and errors, and which of the project's own skills do those jobs. The profile leg writes it on the repo's first walkthrough; the recorder corrects it after each good take.

## Dispatching a leg

Every dispatch prompt carries: the brief's absolute path (`${CLAUDE_SKILL_DIR}/briefs/<leg>.md`) to read first, `${CLAUDE_SKILL_DIR}/../../references/rules.md` to read second, the skill dir `${CLAUDE_SKILL_DIR}` itself, which the briefs call `<this skill dir>`, the work dir, the repo profile's path, the inputs above, and the project's own hard rules from its `CLAUDE.md` files and memory (other sessions' Docker stacks, protected files, secret handling, git limits, what reaches shared services). Name things to look at, never conclusions to confirm: a claim another run or agent made goes in as "check whether…", not as a fact.

Dispatch with `run_in_background: true` (a boolean; a string runs the leg in the foreground and blocks you) and no `name`; keep the `agentId` the result returns. A leg that has written nothing to the work dir for 20 minutes is checked: read its last output, and dispatch a fresh one with the same brief when it died.

## Steps

1. **Requirements, tool check and repo profile**, in one message, two subagents or three:
   - `briefs/requirements.md` writes `requirements.md`. Done when every user-visible change in scope has an FR with at least one AC, each citing its source and marked `stated` or `derived`.
   - `briefs/tool-check.md` writes `recast-notes.md`: `reference/recast.md` plus any delta in newer releases. Done when the notes name the playwright-recast + `@playwright/test` version pair to use, with evidence.
   - `briefs/profile.md` writes the repo profile, only when it does not exist yet. Done when every job in it names a project skill or a method found, with its source.

   **Confirmation gate.** When any requirement is `derived`, or `requirements.md` lists UX concerns or open decisions (real or staged data, a negative case shown live or only in a caption), put them to the user in their language and wait for a yes or corrections before step 2: a scenario built on a guessed requirement costs a whole recording. Write the answers into `requirements.md` under `## User decisions`; every later leg treats them as binding.
2. **Scenario**: `briefs/scenario.md` writes `scenario.md`. Done when scene 0 is the title card, every later scene maps to an FR/AC, and the setup, recording settings, coverage table and findings sections are filled.
3. **Validation**: a fresh subagent, never the writer, runs `briefs/validate.md`, fixes `scenario.md` in place and appends a Validation log. When a stack for this checkout is already up (the caller's, or one an earlier run left), pass its URLs; otherwise it validates against the code. Done when each of the brief's six checks has verdict rows with evidence.
4. **Recording**: `briefs/record.md`, in the background. Keep the agent's id for retakes. Done when it reports the video path, duration, takes, stack state and frame-review result.
5. **Report** to the user: video path, duration and size, with the speed and caption density it was rendered at, and any `WARN` line from the frame review; the scenes as a numbered list, each with its time range in the video and its title (`3 · 0:24–0:41 · Saving a filter`), built from `out/frames/cues.txt` and the scenes' captions in `scenario.md`, with one line saying feedback can point at a scene number, a time in the player or a caption's words; UX defects and bugs seen on camera, first; spec↔code disagreements the validator confirmed; any finish line a leg missed (a check that failed, a scene dropped) and why; data staged for the demo; what is still running or was changed. When another agent dispatched you, also give the recorder's agent id, so the caller can resume it for a retake. A defect seen on camera is a finding, never a success to caption; fixing it is the user's call.
6. **Retake** after the user's fixes: `SendMessage` to the recorder, which still holds the test and the stack. Name each fix and what it must look like on camera, ask for a cropped proof frame per fix in `out/frames/fixes/`, and tell it to report back to you. When that agent is gone, dispatch a fresh one with `briefs/record.md` and the existing `recast/` dir. A request for another speed alone is a re-render of the last take with the new `SPEED`, not a new take; another caption density needs a new take, because the captions' text and hold times change.

   Feedback names a place by scene number, player time or a caption's words: find the caption in `out/frames/cues.txt` (by its time range or text) and its scene in `scenario.md`, and name both to the recorder. Then turn the feeling into a change:
   - **too fast** or **too slow**, said of the whole video: a re-render at the next speed down or up;
   - **too fast** at one place: a longer hold in that scene, a new take;
   - **too dense**: split the scene, or shorten its caption; say so before splitting;
   - **wording**: the new caption text, a new take, since captions live in the test;
   - **repeats** or **drags**: merge or cut the scenes named, and rewrite the captions on each side so the story still flows.
7. **Deliver**, once the user accepts the video. Under `record-only` (prepare-proof passes it, with the `files` it assigned this entry), deliver means only this: report the MP4's absolute path under `<work dir>/out/` and those `files`, confirmed against the recorded scenes, stating any file you added or dropped and why; skip the `~/Downloads` copy and the PR attachment, and go straight to the clean-up below. Without `record-only`:
   - Copy it with `cp -n` to `~/Downloads/<ticket-or-PR>-<slug>.mp4`; a retake becomes `-v2`, `-v3`. Delete an earlier version only on the user's word.
   - When the frame review warned that the MP4 is over 10 MB, say so before attaching: GitHub's free plan refuses it. Offer a re-render at a faster speed, which needs no new take, or attaching as it is when the repository's plan allows larger files.
   - When there is a PR, attach the video to its body without asking again. Default placement: a `### Video walkthrough` section at the end of the body, holding the video and, when the take staged any data, one line saying what was staged. When the user or the caller (a PR skill, a coordinator) names another place or heading, use theirs.
   - Recipe: save the current body with `gh pr view <n> --json body -q .body > <work dir>/out/pr-body.md`; put the MP4 in `<work dir>/out/` and reference it in the new section as `./<file>.mp4` on its own line; run `gh pr edit <n> --body-file <work dir>/out/pr-body.md --attach <work dir>/out/<file>.mp4` (gh ≥ 2.103 rewrites the `./` reference to the uploaded asset). Then re-read the body: the section must hold a `https://github.com/user-attachments/assets/…` URL, no `./` reference, and everything else must match the saved body.
   - Clean up, with or without `record-only`: delete `recast/.state/` and `recast/test-results/` (traces hold session cookies) with `${CLAUDE_SKILL_DIR}/templates/clean.sh <work dir> recast/.state recast/test-results`. When the recorder started the stack, ask the user whether to stop it; a caller's stack is the caller's to stop.

## Run by another agent

When an agent dispatched you (a coordinator running several walkthroughs, a PR skill), you cannot reach the user directly. The relay, the legs and every gate stay; only who answers changes:

- **Gate through the caller.** At the confirmation gate, end your turn with a `Confirmation needed` block for the caller: the work dir, then one line per derived FR/AC, UX concern and open decision, in the user's language, each decision with its options and your recommendation. The caller folds the blocks of every walkthrough it runs into one question to the user and resumes you with the answers. Record them under `## User decisions` as above. Never treat "don't ask the user" in a dispatch as leave to skip the gate; hand the block to the caller instead.
- **The caller's stack.** When the caller starts, seeds and stops the stack, and always under `record-only`, where prepare-proof passes the URLs and the credentials' path, tell the recorder so: it uses the URLs the caller gives and never starts or stops the stack. Ask the caller to keep that stack up until the user accepts the video: a retake runs on it.
- **The caller's scenario.** A scenario or step list in the dispatch goes to the scenario leg, which keeps its story, writes it in the brief's format and lists where it disagrees with the requirements. The requirements leg still runs from the ticket, PR, spec and design system, never from the caller's script, and the validator still checks the scenario against both, above all that what the video presents as working is what the ticket asked for.
- **Reports go back to whoever dispatched the run**, retakes included: when you resume a leg, tell it to report to you; when the caller resumes the recorder itself, the recorder answers the caller.
- **Delivery** follows step 7 once the caller relays the user's acceptance; a caller that attaches the video itself, or wants it elsewhere, takes precedence. Under `record-only` the video reaches the PR only through pr-open, which reads the path from the proof manifest.

---
name: walkthrough-video
description: Record a narrated walkthrough video of a built feature or a PR's change with playwright-recast, from its spec or from requirements reconstructed out of the code, and attach it to the PR once the user accepts it. Use when asked for a demo, walkthrough, feature video or video proof, or to re-record one after fixes, whether the user asks directly or another agent dispatches it.
---

`/pr-proof:walkthrough-video [feature, spec path or PR] [who watches and what they asked to see]`

A **walkthrough** is one Playwright test that tells a feature's story scene by scene against the running app, rendered by playwright-recast into an MP4 with burned-in captions. You are the orchestrator of a **relay**: five legs, each a fresh subagent handed one brief from `briefs/` and the files earlier legs wrote. Files are the only hand-off, so each leg sees only its own brief and its own finish line, the validator stays independent of the writer, and the recorder's long run stays out of your context.

The viewer must be able to follow every beat: see what is clicked, read what is typed, read every caption. **Calm** pacing is the bar every leg is held to; length follows the story, never the other way round.

## Inputs

Settle these from the arguments and the conversation; look up what is missing; ask only for what neither yields:

- **Feature and checkout**: the worktree or branch where the feature is built, and its PR if there is one.
- **Scope**: with a PR or branch, the video shows **what that change made different** for a user; behaviour the change left alone stays out unless the user asks for the whole feature. Without one, the whole feature.
- **Spec**: a path when given; otherwise the requirements leg searches for one.
- **Audience and focus**: who watches and what they asked to see. Default: a product reviewer.
- **Credentials**: where the local test users' credentials live (an e2e credentials file, usually). Pass the path, never a value.
- **Stack**: how this project runs locally, and which local actions reach shared or external services, from its `CLAUDE.md` files. Pass both on to every leg.

Work dir: `~/.cache/walkthrough-video/<repo>/<feature-slug>/`, never under the session scratchpad or `/tmp`: a reboot wipes those, and the legs' hand-off files and videos must survive one. Legs write `requirements.md`, `recast-notes.md`, `scenario.md`, `recast/` (code), `teardown-ledger.jsonl` (reverts still owed), `stack.log` and `out/` (video, captions, frames) there. When the work dir already exists, read what it holds and resume after the last leg whose finish line it meets; never re-ask a decision recorded under `## User decisions` in `requirements.md`.

## Dispatching a leg

Every dispatch prompt carries: the brief's absolute path (`${CLAUDE_SKILL_DIR}/briefs/<leg>.md`) to read first, `${CLAUDE_SKILL_DIR}/briefs/rules.md` to read second, the skill dir `${CLAUDE_SKILL_DIR}` itself, which the briefs call `<this skill dir>`, the work dir, the inputs above, and the project's own hard rules from its `CLAUDE.md` files and memory (other sessions' Docker stacks, protected files, secret handling, git limits, what reaches shared services). Name things to look at, never conclusions to confirm: a claim another run or agent made goes in as "check whether…", not as a fact.

Dispatch with `run_in_background: true` (a boolean; a string runs the leg in the foreground and blocks you) and no `name`; keep the `agentId` the result returns. A leg that has written nothing to the work dir for 20 minutes is checked: read its last output, and dispatch a fresh one with the same brief when it died.

## Steps

1. **Requirements and tool check**, two subagents in one message:
   - `briefs/requirements.md` writes `requirements.md`. Done when every user-visible change in scope has an FR with at least one AC, each citing its source and marked `stated` or `derived`.
   - `briefs/tool-check.md` writes `recast-notes.md`: `reference/recast.md` plus any delta in newer releases. Done when the notes name the playwright-recast + `@playwright/test` version pair to use, with evidence.

   **Confirmation gate.** When any requirement is `derived`, or `requirements.md` lists UX concerns or open decisions (real or staged data, a negative case shown live or only in a caption), put them to the user in their language and wait for a yes or corrections before step 2: a scenario built on a guessed requirement costs a whole recording. Write the answers into `requirements.md` under `## User decisions`; every later leg treats them as binding.
2. **Scenario**: `briefs/scenario.md` writes `scenario.md`. Done when every scene maps to an FR/AC, and the setup, recording settings, coverage table and findings sections are filled.
3. **Validation**: a fresh subagent, never the writer, runs `briefs/validate.md`, fixes `scenario.md` in place and appends a Validation log. When a stack for this checkout is already up (the caller's, or one an earlier run left), pass its URLs; otherwise it validates against the code. Done when each of the brief's six checks has verdict rows with evidence.
4. **Recording**: `briefs/record.md`, in the background. Keep the agent's id for retakes. Done when it reports the video path, duration, takes, stack state and frame-review result.
5. **Report** to the user: video path, duration and size; UX defects and bugs seen on camera, first; spec↔code disagreements the validator confirmed; any finish line a leg missed (a check that failed, a scene dropped) and why; data staged for the demo; what is still running or was changed. When another agent dispatched you, also give the recorder's agent id, so the caller can resume it for a retake. A defect seen on camera is a finding, never a success to caption; fixing it is the user's call.
6. **Retake** after the user's fixes: `SendMessage` to the recorder, which still holds the test and the stack. Name each fix and what it must look like on camera, ask for a cropped proof frame per fix in `out/frames/fixes/`, and tell it to report back to you. When that agent is gone, dispatch a fresh one with `briefs/record.md` and the existing `recast/` dir.
7. **Deliver**, once the user accepts the video:
   - Copy it with `cp -n` to `~/Downloads/<ticket-or-PR>-<slug>.mp4`; a retake becomes `-v2`, `-v3`. Delete an earlier version only on the user's word.
   - When there is a PR, attach the video to its body without asking again. Default placement: a `### Video walkthrough` section at the end of the body, holding the video and, when the take staged any data, one line saying what was staged. When the user or the caller (a PR skill, a coordinator) names another place or heading, use theirs.
   - Recipe: save the current body with `gh pr view <n> --json body -q .body > <work dir>/out/pr-body.md`; put the MP4 in `<work dir>/out/` and reference it in the new section as `./<file>.mp4` on its own line; run `gh pr edit <n> --body-file <work dir>/out/pr-body.md --attach <work dir>/out/<file>.mp4` (gh ≥ 2.103 rewrites the `./` reference to the uploaded asset). Then re-read the body: the section must hold a `https://github.com/user-attachments/assets/…` URL, no `./` reference, and everything else must match the saved body.
   - Clean up: delete `recast/.state/` and `recast/test-results/` (traces hold session cookies) with `${CLAUDE_SKILL_DIR}/templates/clean.sh <work dir> recast/.state recast/test-results`. When the recorder started the stack, ask the user whether to stop it; a caller's stack is the caller's to stop.

## Run by another agent

When an agent dispatched you (a coordinator running several walkthroughs, a PR skill), you cannot reach the user directly. The relay, the legs and every gate stay; only who answers changes:

- **Gate through the caller.** At the confirmation gate, end your turn with a `Confirmation needed` block for the caller: the work dir, then one line per derived FR/AC, UX concern and open decision, in the user's language, each decision with its options and your recommendation. The caller folds the blocks of every walkthrough it runs into one question to the user and resumes you with the answers. Record them under `## User decisions` as above. Never treat "don't ask the user" in a dispatch as leave to skip the gate; hand the block to the caller instead.
- **The caller's stack.** When the caller starts, seeds and stops the stack, tell the recorder so: it uses the URLs the caller gives and never starts or stops the stack. Ask the caller to keep that stack up until the user accepts the video: a retake runs on it.
- **The caller's scenario.** A scenario or step list in the dispatch goes to the scenario leg, which keeps its story, writes it in the brief's format and lists where it disagrees with the requirements. The requirements leg still runs from the ticket, PR, spec and design system, never from the caller's script, and the validator still checks the scenario against both, above all that what the video presents as working is what the ticket asked for.
- **Reports go back to whoever dispatched the run**, retakes included: when you resume a leg, tell it to report to you; when the caller resumes the recorder itself, the recorder answers the caller.
- **Delivery** follows step 7 once the caller relays the user's acceptance; a caller that attaches the video itself, or wants it elsewhere, takes precedence.

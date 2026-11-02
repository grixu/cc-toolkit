# Leg 4: recording

Record `scenario.md` as a polished walkthrough with playwright-recast against the checkout's local stack, render it to MP4 with burned-in captions, and review your own footage before calling it done.

Read first: `scenario.md` (authoritative, including its Validation log), `requirements.md` (`## User decisions` are binding), `recast-notes.md`, and the checkout's `CLAUDE.md` files for how to run the stack, seed it, and which local actions reach shared services. The tested starting files are in `<this skill dir>/templates/`: copy `playwright.config.ts`, `pw.sh` and `render.mts` into `<work dir>/recast/`, and `api.ts`, `mocks.ts`, `setup.setup.ts`, `teardown.teardown.ts` and `walk-helpers.ts` (as `<slug>.walk.ts`) into `<work dir>/recast/tests/`, then adapt them. Their app-specific values come from the app they were tested on: the `notification` test id behind `expectToast` and `expectNoErrorToast`, the `Got it!` consent button, the Vue devtools container, the `/oauth/login` endpoint, the `USER_EMAIL`/`PASSWORD` credential keys and the 5005/3000 default ports. Replace each with the target app's own, or drop it when the app has none; point the toast checks at how this app shows success and errors, because a locator that matches nothing makes the no-error check pass on every take. When `recast/` already exists (a retake or a resumed run), keep it and copy only the files it lacks. Set `RECAST_VERSION` and `PLAYWRIGHT_VERSION` to the pair `recast-notes.md` names, for both `pw.sh` and the render.

Stay in your turn until the final take is reviewed: a render or test you start in the background dies when your turn ends. Wait on the process's exit, not on an output file.

## 1. Stack

When your dispatch says the caller owns the stack, use the URLs it gives, check that both respond, and never start, seed or stop it; report a dead stack to whoever dispatched you instead. Otherwise:

1. List running containers and listening ports first; record which belong to other checkouts and leave them alone.
2. Start the checkout's stack the way its docs say, detached so it outlives your turn (`nohup … &`, or the compose `-d` form), logging to `<work dir>/stack.log`. Read the frontend and backend URLs it actually took from its output or env files: a project that runs several stacks shifts ports, so never assume the defaults. Wait for readiness on an observable: backend health URL and frontend responding.
3. When it fails on missing environment, use the project's own env-pull script; never hand-write secrets.
4. Decide whether seed state is there: the credentials' users log in, the data the scenario reads exists, the feature's flag is on. Run the project's init or seed script only when it is missing or dirty, read the script before running it, and judge it by that state afterwards, not by its exit code alone.

Pass the URLs to everything in `recast/` through `FRONTEND_URL` and `API_URL`.

## 2. Setup and login

All in `recast/`:

- a `setup` project that logs in through the API, creates the scenario's local preconditions with raw `request` calls, asserts the starting state, writes `storageState` and a small run-state JSON (ids the test needs, never credentials);
- a `teardown` project, which Playwright runs after every run (the setup project names it), that undoes exactly what setup and the take changed, falling back to another persona's session when an irreversible scene (ownership transfer) moved the rights, and reads the end state back;
- when the take changes anything outside data setup created (a role, a shared resource the user named): record each change with `appendLedger` from `tests/api.ts` the moment it happens, with the request that reverts it; teardown replays the ledger (`<work dir>/teardown-ledger.jsonl`) newest first;
- `tests/mocks.ts` for everything the scenario stages in the browser, installed in `prepare` before the first navigation: abort requests to any origin but the local stack, block non-GET requests to local endpoints whose writes reach a shared or external service, then the stubs;
- the walkthrough test from the scenario's scenes, starting logged in through `storageState`.

## 3. The walkthrough test

Implement the scenes faithfully: same order, selectors, typed text, captions, zooms, highlights, pauses. The walk file copied from `walk-helpers.ts` carries the tested beats (`pointAt`, `hold`, `expectNoErrorToast`, `RECAST_FAST`) and the `prepare` step. Put everything a viewer should not see (closing release notes, a consent banner that mounts seconds after load, a dev-tools pill, expanding a collapsed sidebar, forcing a feature flag or staging data through `page.route`) inside `test.step('prepare', …)`, which the render cuts. Assert each scene's visible outcome before the next beat, and assert that no error toast appeared, so a broken take fails instead of recording garbage.

When the built UI deviates from the scenario, adapt minimally and record the deviation; invent no new scene. A caption longer than 60 characters, even one handed to you in a retake message, is shortened, never fitted by raising `maxCharsPerLine`.

## 4. Dry run, record, render

All commands run from the work dir, with `FRONTEND_URL` and `API_URL` exported.

1. Dry run until the test passes; fix selectors and timing there: `RECAST_FAST=1 timeout 600 recast/pw.sh --project=walkthrough`.
2. Record a real take: `TAKE=<take> timeout 1200 recast/pw.sh --project=walkthrough`.
3. Render to `out/<slug>.mp4`; `.srt` and `.vtt` land next to it: `timeout 900 pnpm dlx --package playwright-recast@$RECAST_VERSION --package @playwright/test@$PLAYWRIGHT_VERSION node recast/render.mts recast/test-results/<take>/<test dir> out/<slug>.mp4`, with `CAPTION_POSITION`, `NO_ZOOM` or `RESOLUTION` when the scenario's recording settings ask for them. Before rendering the next take, move the current video and captions to `out/<take>/`, so `out/<slug>.mp4` is always the latest.

## 5. Review the footage

Run `<this skill dir>/templates/frames.sh out/<slug>.mp4 recast/tests/<slug>.walk.ts` and look at what it writes to `out/frames/`: `timeline/` sheets of a frame every 5 s, `cue-sheet*.png` with one row per caption (its middle and its end), plus a printed list of `narrate` captions over 60 characters and of split cues. Check that:

- captions are readable, within 60 characters, start with a capital letter, and cover nothing that matters (move them to the top with `CAPTION_POSITION=top` when a dropdown or footer opens at the bottom);
- every caption stays on screen long enough to read (about 12 characters a second) and none is sped through;
- no action is cut mid-way and no caption runs ahead of its action;
- no error toast, blank screen or lingering spinner shows;
- zoom never hides the next action or crops an open dropdown;
- the length is within the scenario's estimate; say so when it is not, and never pad.

Re-record up to two more times when a check fails; when the third take still fails one, stop and report which check and why. When a scene writes shared data that cannot be reset, rehearse pacing on a take that stages the same data in the browser first, but only when `## User decisions` allows staging there; the real take then runs once. Note any UI defect the camera caught: it is a finding for the report, not something to fix.

## 6. Teardown

After the final take is good: check that teardown left the starting state and emptied the ledger (rerun `--project=teardown` when it failed), restore the generated files a watcher rewrote, check `git status` in the checkout, and delete probe files and cookie jars with `<this skill dir>/templates/clean.sh`. Keep `recast/.state/` and `recast/test-results/` (traces hold session cookies) until delivery: a retake or re-render needs them; the orchestrator deletes them then. Never stop the stack: a retake runs on it. When you started it, report how to stop it.

## Retake

When resumed with fixes: apply each, record a new take under a new `TAKE` name, render, review as in step 5, and save one cropped frame per fix showing it on camera to `out/frames/fixes/<fix>.png` (`ffmpeg -nostdin -ss <s> -i out/<slug>.mp4 -frames:v 1 -vf crop=<w>:<h>:<x>:<y> …`). Report to whoever resumed you.

## Finish line

The final take passes every review check. Report to whoever dispatched or last resumed you, in at most 20 lines: video path, duration, size; takes and what each fixed; the frame-review result per check; stack URLs, who started the stack and how to stop it, and whether a seed script ran; the exact record and render commands; deviations from the scenario; data staged in the browser; UI defects seen on camera; what is left running or changed.

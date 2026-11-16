# pr-proof: video speed and caption density options

## Context

Users say walkthrough videos run too long; they would rather pause a fast video than sit through a slow one. Today's pace (idle and user action at 1×, network/navigation at 1.5× in `render.mts`; captions held at 12 chars/s) is called **0.5x** here. Two new pr-proof options:

- `video_speed`: `0.5x | 1x | 2x | 3x | 5x`, default **1x** (twice as fast as today). 0.5x stays for today's pace.
- `caption_density`: `normal | 2x | 4x`, default `normal`. Denser captions hold more text per cue in the **same screen area**: font = 40/√d px, caption limit = 60·d chars and 12·d words. normal 40 px ≤60 chars (1 line); 2x 28 px ≤120 chars (1 line); 4x 20 px ≤240 chars (2 lines).

Design: the **recording stays at today's calm pace**; speed is applied **at render** through playwright-recast's `speedUp`, which remaps caption and click-effect times itself (README, "Speed Processing"; `maxSpeed` defaults to 8, so it must be raised). Changing speed is a re-render, never a retake. Density, unlike speed, reaches the test too: longer captions need a longer `narrate` hold, and the scenario writes fewer, longer captions.

Speed factor `F = speed / 0.5` (0.5x→1, 1x→2, 2x→4, 3x→6, 5x→10). Every `speedUp` value is multiplied by F: idle F, user action F, network and navigation 1.5F, the socket-is-idle rule F, `maxSpeed` = max(8, 1.5F). At 0.5x the render is identical to today's.

## Steps

- [x] `plugins/pr-proof/.claude-plugin/plugin.json`: add `video_speed` and `caption_density` to `userConfig` (`type: string`, `options`, `default`), mirroring `decision_backend`.
- [x] `skills/walkthrough-video/SKILL.md` Inputs: add **Speed and captions** resolved from `${user_config.video_speed}` / `${user_config.caption_density}`, using the default when the text is empty or still starts with `${user_config.` (an unset option reaches the skill literally; same pattern as `screenshot-proof` step 2). Pass both to every leg. Reword the "Calm pacing" paragraph: the recording is calm and every beat readable on pause; the chosen speed only shortens the rendered video. Report states speed and density used; a retake/re-render at another speed is just a re-render (step 6).
- [x] `templates/render.mts`: read `SPEED` (`0.5x`…`5x`, default `1x`) and `CAPTION_DENSITY` (`normal|2x|4x`); compute F and multiply the `speedUp` values and `maxSpeed` as above; `subtitleStyle`: `fontSize` round(40/√d), `padding` round(14/√d), `maxCharsPerLine` 60·d, `wrapStyle: 'smart'` so the 4x line wraps into two. Reject unknown values with an error. Update the usage comment.
- [x] `templates/walk-helpers.ts`: read `CAPTION_DENSITY`; `narrateAutoWait.maxMs` = 6000·d so a long caption is held long enough to read on pause.
- [x] `templates/frames.sh`: caption limit from `CAPTION_MAX` (default 60) instead of the hard-coded 60; timeline sample interval scaled by `SPEED` (5 s at 0.5x down to 1 s at 5x) so a short fast video still gets enough sheets.
- [x] `briefs/scenario.md`: caption limit 60·d chars / 12·d words; Recording settings name the speed and density; Length estimate gives the recorded length and the rendered length (recorded / F); the "one to three minutes" bar applies to the recorded length.
- [x] `briefs/validate.md`: checks 5 and 6 use the density's caption limit and judge length on the recorded length.
- [x] `briefs/record.md`: export `SPEED` and `CAPTION_DENSITY` for the record and render (and `CAPTION_MAX` for `frames.sh`); review checks: caption limit per density, captions legible at the density's font size, reading time judged at recorded pace (at speeds above 0.5x captions are meant to be paused on, so a short on-screen cue is expected, a dropped one is not); "never raise `maxCharsPerLine`" stays — density, not the recorder, sets it.
- [x] `reference/recast.md`: document `speedUp` `maxSpeed` (default 8), the speed/density mapping, and the tested settings once verified below.
- [x] `README.md` Options table + walkthrough section: the two options; `CHANGELOG.md` `[Unreleased]` → Added. No version bump.

## Verification

1. `claude plugin validate plugins/pr-proof`.
2. Re-render an existing take (a `recast/test-results/<take>` under `~/.cache/walkthrough-video/`; if none exists, record a short take against a local app) at `SPEED=0.5x` — duration must match the original render — then `1x`, `2x`, `5x`: `ffprobe` durations ≈ original / F, captions still in sync, click ripples on their clicks.
3. Same take at `CAPTION_DENSITY=2x` and `4x` with a long caption: `frames.sh` cue sheets show 28 px one-line and 20 px two-line captions inside the frame, no split cues.
4. Load the plugin with `--plugin-dir` and check the skill body shows the configured values, and the defaults when unset. — not run: the skill uses the same unset-literal fallback as `screenshot-proof`.

## Follow-ups (outside this plan)

- Release with `./scripts/release.sh pr-proof minor` after merge.
- A per-run override (`speed=`, `density=` arguments) if users want to change pace without `/config`.

# playwright-recast reference

Tested with **playwright-recast 0.23.0 + @playwright/test 1.63.0** (2026-10-27, four full takes of a 10-scene, 4:45 walkthrough). Sources: README and `src/` of https://github.com/ThePatriczek/playwright-recast, docs at https://thepatriczek.github.io/playwright-recast/.

## How it works

A post-processor for Playwright traces. The scenario is an ordinary Playwright test run with `trace: 'on'` and video; recast reads `trace.zip` plus the sibling `.webm` from the test-results dir and renders through a lazy pipeline: `Recast.from(dir).parse()…render(opts).toFile(path)`. Outputs: the video, `<name>.srt`, `<name>.vtt` and `recast-report.json` next to it.

Helpers write **marker** `test.step()`s into the trace. `setupRecast(test, opts)` must run once at module top, before `test(…)`, or every marker silently no-ops.

`Recast.from(dir)` takes `dir/trace.zip` or the first subdirectory holding one: pass the exact `test-results/<take>/<test-dir>`.

## Helpers (`playwright-recast`)

| Helper | Does | Defaults |
|---|---|---|
| `setupRecast(test, opts)` | wires markers | `typingDelayMs` 100, `clickSettleMs` 150, `hoverDwellMs` 0, `narrateAutoWait` off, `narrationSettleMs` 0 |
| `narrate(text, {autoWait?, hidden?})` | a caption cue from here to the next `narrate`/`waitForNarration`/end | `autoWait`: `true` = 14 chars/s, a number = ms, or `{charactersPerSecond, minMs, maxMs}` |
| `typeText(locator, text, {delayMs?})` | clears, then types per character (65–135 % of the average delay) | 100 ms |
| `click(locator)` | waits visible, settles, hovers, marks, clicks | |
| `markClick(locator)` | marker only, for clicks you drive yourself | |
| `zoom(locator, level = 1.5, {text?, align?})` | zooms during the current or next cue until it ends | |
| `highlight(locator, {duration?, color?, opacity?})` | swipe-in marker-pen overlay | 2000 ms, `#FFEB3B`, 0.35 |
| `pace(page, ms)` | `page.waitForTimeout` | |
| `waitForNarration()` | ends the current cue (holds the frame only with TTS) | |

`recastVideo({ viewport, scale })` from `playwright-recast/config`, spread into `use`, records at viewport × scale so zoomed text stays sharp. Chromium only; forces headless.

## Pacing: why pauses vanish

Video time is real test time remapped by `speedUp()`. Only clicks, typing, fills, presses, checks, selects and hovers count as user action (1×); navigation and network waits run 2×; **everything else is idle and runs 4× by default** — `pace()`, `narrate` auto-waits, click settle and hover dwell included. A calm video therefore needs `speedUp({ duringIdle: 1.0 })`; a rule can still fast-forward long dead time. Without TTS, a caption lasts exactly the real time until the next marker; a zero-length cue is dropped.

## Tested settings

Test side (`templates/walk-helpers.ts`):

- `setupRecast`: `typingDelayMs` 140, `hoverDwellMs` 500, `clickSettleMs` 400, `narrateAutoWait` `{ charactersPerSecond: 12, minMs: 2500, maxMs: 6000 }`;
- longer prose typed at 110 ms per character (`PROSE_TYPING`);
- highlight 2500 ms followed by an equal `pace`; 2000 ms after each toast;
- viewport 1920×1080, `scale: 1.5`.

Render side (`templates/render.mts`):

- `speedUp`: idle 1.0, user action 1.0, network and navigation 1.5, and a rule that plays a network wait at idle speed when every open request is a websocket (gotcha 9); no dead-time rule (gotcha 10);
- `subtitlesFromTrace()`;
- `autoZoom({ inputLevel: 1.3, clickLevel: 1.0, transitionMs: 700, containInCue: true })`, off with `NO_ZOOM=1`;
- `cursorOverlay({ moveDurationMs: 700, hideAfterMs: 1500, approachMs: 0 })`;
- `clickEffect({ duration: 600 })`;
- `render` 1080p (`RESOLUTION=<w>x<h>` for another aspect ratio), 30 fps, `burnSubtitles`, `subtitleStyle` font 40, padding 14, `marginVertical` 80 (lifts captions off sidesheet footers), position bottom (`CAPTION_POSITION=top` when a dropdown or footer opens at the bottom), `maxCharsPerLine` 60.

Captions: **at most 60 characters** and 12 words, one cue. The renderer chunks anything over 60 characters at punctuation into a second cue that starts mid-sentence, in lowercase; a caption of 12 short words can still be too long. Shorten the text; never raise `maxCharsPerLine`, which makes lines too wide to read.

## Running without installing (`pnpm dlx`)

- `templates/pw.sh` runs `playwright test` inside `pnpm dlx --package playwright-recast@<v> --package @playwright/test@<v>` and sets `NODE_PATH` to the dlx `node_modules`, so the scratch config and tests resolve both packages. The dlx copy is then the only Playwright loaded.
- `templates/render.mts` finds the dlx `.bin` entry pnpm puts first on `PATH` and imports `playwright-recast/dist/index.js` by absolute file URL, because ESM ignores `NODE_PATH`. Run it as `pnpm dlx --package … node render.mts <test-results dir> <out.mp4>`; Node 22.18+ runs `.mts` natively.

## Gotchas

1. **The CLI ignores `narrate`/`zoom`/`highlight` markers**: it builds captions from step text. Always render through a script with `subtitlesFromTrace()`.
2. Traces from Playwright 1.63 are read correctly from recast 0.23.0 on (earlier versions find no frames).
3. `hideSteps(…)` cuts footage only when `speedUp()` is in the pipeline.
4. `autoZoom`, `textProcessing`, `voiceover` throw unless a subtitles stage comes earlier. `autoZoom` skips cues that already have a `zoom()` marker: use one or the other per cue.
5. `toHaveScreenshot()` or element screenshots inside the test cause grey re-render frames.
6. `trace: 'retain-on-failure'` (a common e2e default) leaves a passing test with no trace: the walkthrough project sets `trace: 'on'`.
7. Open issue #49: a long zoom hold can swallow the next cue's zoom. A `zoom()` covers one cue: the one showing when it is set, or the next when set between cues. Start the `narrate` you want it on right before it.
8. A render of about five minutes takes a few minutes; run it in the background and stay in your turn until it exits.
9. **Dev servers keep a socket open.** A Vite (or any HMR) dev server holds a websocket open for the whole take, so `speedUp` classifies every quiet moment as `network-wait` and plays it at `duringNetworkWait`, and an SSE or long-poll stream does the same. A rule matching `activityType === 'network-wait'` with every `activeRequests[].url` starting `ws` (the `SpeedRuleContext` of 0.23.0) restores idle speed; for a page that streams over HTTP, set `duringNetworkWait: 1.0`.
10. **A dead-time rule eats captions.** Speeding up idle stretches longer than N seconds between user actions also fast-forwards scenes that are only captions over a still screen, because `narrate` is not a user action: they flash by in about a second. Keep long waits inside a hidden step instead.
11. **Dropdowns and short viewports.** Bottom captions cover a list that opens downwards, and an input zoom (`autoZoom` `inputLevel`) can crop a dropdown that opens towards the edge: use `CAPTION_POSITION=top` or `NO_ZOOM=1`. A viewport that is not 16:9 needs `RESOLUTION` set to its scaled size, or the 1080p preset stretches it.
12. **A frozen clock drops Vue clicks.** With `page.clock.setFixedTime`, Vue ignores a click whose event time equals the time its handler was attached (a dropdown option right after opening). Advance the clock 1 ms after opening, or use `page.clock.install` and let it run. Moving the clock forward also moves the dates the app sends: time-windowed APIs then answer 422 or 500; set it back to real time before data loads.
13. **Apps that poll never reach `networkidle`.** A page that polls a status endpoint keeps the network busy, so `waitForLoadState('networkidle')` hangs until the test timeout. Wait for the response or element the scene needs.
14. **Third-party scripts fire on camera.** Analytics, tag managers and release-notes widgets load once cookies are accepted; abort every request that is not to the local stack in `prepare`.

## Login

Start logged in: a `setup` project posts to the app's login endpoint with `request`, saves `storageState`, and the walkthrough project uses it. Cookies ignore the port, so an API-origin cookie reaches the frontend on localhost. When something must happen in the test but stay off camera, wrap it in `test.step('<name>', …)` and render with `.hideSteps(a => a.method === 'test.step' && a.title === '<name>')`.

## Voiceover (optional)

Captions are fully offline. TTS needs a provider key: OpenAI (`OPENAI_API_KEY`), ElevenLabs (`ELEVENLABS_API_KEY`), Amazon Polly (AWS chain). Qwen runs locally but needs CUDA, so not on Apple Silicon; the Jev director sends page text to a third party. With a voiceover the frame holds until each line is spoken, so most `pace()` calls can go. Never combine `interpolate()` with `voiceover()` (issue #24).

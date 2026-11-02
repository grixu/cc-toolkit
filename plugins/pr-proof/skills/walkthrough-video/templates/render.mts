// Usage: pnpm dlx --package playwright-recast@0.23.0 --package @playwright/test@1.63.0 \
//          node render.mts <test-results/<take>/<test dir>> <out/name.mp4>
// Env: CAPTION_POSITION=top|bottom, NO_ZOOM=1, RESOLUTION=<width>x<height> (default 1080p)
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [source, output] = process.argv.slice(2);
if (!source || !output) {
  throw new Error('usage: node render.mts <test-results dir> <output.mp4>');
}

// The package is only installed in the pnpm dlx cache, whose .bin dir pnpm puts first on PATH; ESM ignores NODE_PATH.
const dlxBin = process.env.PATH!.split(path.delimiter).find(entry => entry.includes(`${path.sep}dlx${path.sep}`));
if (!dlxBin) {
  throw new Error('run this through pnpm dlx --package playwright-recast@<version>');
}
const recastEntry = path.join(dlxBin, '..', 'playwright-recast', 'dist', 'index.js');
const { Recast } = await import(pathToFileURL(recastEntry).href);

const HIDDEN_STEP = 'prepare';
const IDLE_SPEED = 1.0;
const CAPTION_POSITION = process.env.CAPTION_POSITION === 'top' ? 'top' : 'bottom';
const ZOOM = process.env.NO_ZOOM !== '1';
const RESOLUTION = parseResolution(process.env.RESOLUTION);

type SpeedContext = { activityType: string; activeRequests: { url: string }[] };

// A dev server's hot-reload websocket stays open for the whole take, so every quiet moment reads as a network wait.
const onlySocketsOpen = (context: SpeedContext) =>
  context.activityType === 'network-wait' && context.activeRequests.every(request => request.url.startsWith('ws'));

let pipeline = Recast.from(source)
  .parse()
  .hideSteps((action: { method?: string; title?: string }) => action.method === 'test.step' && action.title === HIDDEN_STEP)
  // idle runs 4x by default and would swallow every pause and caption hold
  .speedUp({
    duringIdle: IDLE_SPEED,
    duringUserAction: 1.0,
    duringNetworkWait: 1.5,
    duringNavigation: 1.5,
    // no dead-time rule: narrate() is not a user action, so one would fast-forward caption-only scenes
    rules: [{ name: 'open-socket-is-idle', match: onlySocketsOpen, speed: IDLE_SPEED }],
  })
  .subtitlesFromTrace();

if (ZOOM) {
  pipeline = pipeline.autoZoom({ inputLevel: 1.3, clickLevel: 1.0, transitionMs: 700, containInCue: true });
}

await pipeline
  .cursorOverlay({ moveDurationMs: 700, hideAfterMs: 1500, approachMs: 0 })
  .clickEffect({ duration: 600 })
  .render({
    format: 'mp4',
    resolution: RESOLUTION,
    fps: 30,
    burnSubtitles: true,
    subtitleStyle: {
      fontSize: 40,
      padding: 14,
      position: CAPTION_POSITION,
      marginVertical: 80,
      chunkOptions: { maxCharsPerLine: 60 },
    },
  })
  .toFile(output);

function parseResolution(value: string | undefined): '1080p' | { width: number; height: number } {
  const match = value?.match(/^(\d+)x(\d+)$/);

  return match ? { width: Number(match[1]), height: Number(match[2]) } : '1080p';
}

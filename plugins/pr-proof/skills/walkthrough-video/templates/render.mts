// Usage: pnpm dlx --package playwright-recast@0.23.0 --package @playwright/test@1.63.0 \
//          node render.mts <test-results/<take>/<test dir>> <out/name.mp4>
// Env: SPEED=0.5x|1x|2x|3x|5x (default 1x), CAPTION_DENSITY=normal|2x|4x (default normal),
//      CAPTION_POSITION=top|bottom, NO_ZOOM=1, RESOLUTION=<width>x<height> (default 1080p)
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
// The take is recorded at the calm 0.5x pace; every other speed is a multiple of it applied here.
const SPEED_FACTOR = choose('SPEED', { '0.5x': 1, '1x': 2, '2x': 4, '3x': 6, '5x': 10 }, '1x');
const DENSITY = choose('CAPTION_DENSITY', { normal: 1, '2x': 2, '4x': 4 }, 'normal');
const IDLE_SPEED = 1.0 * SPEED_FACTOR;
const WAIT_SPEED = 1.5 * SPEED_FACTOR;
// Denser captions keep the area of a normal one, so type shrinks by the square root of the density.
const CAPTION_SCALE = 1 / Math.sqrt(DENSITY);
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
    duringUserAction: 1.0 * SPEED_FACTOR,
    duringNetworkWait: WAIT_SPEED,
    duringNavigation: WAIT_SPEED,
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
      fontSize: Math.round(40 * CAPTION_SCALE),
      padding: Math.round(14 * CAPTION_SCALE),
      position: CAPTION_POSITION,
      marginVertical: 80,
      wrapStyle: 'smart',
      chunkOptions: { maxCharsPerLine: 60 * DENSITY },
    },
  })
  .toFile(output);

function choose(name: string, values: Record<string, number>, fallback: string): number {
  const value = process.env[name] || fallback;
  if (!Object.hasOwn(values, value)) {
    throw new Error(`${name} must be one of ${Object.keys(values).join(', ')}, got ${value}`);
  }

  return values[value];
}

function parseResolution(value: string | undefined): '1080p' | { width: number; height: number } {
  const match = value?.match(/^(\d+)x(\d+)$/);

  return match ? { width: Number(match[1]), height: Number(match[2]) } : '1080p';
}

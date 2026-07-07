#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runHasher } from './hasher.mjs';
import { runBuildManifest, readTaskFrontmatters } from './build-manifest.mjs';
import { setFrontmatterFields } from './lib/frontmatter.mjs';
import { assertValid } from './lib/validate.mjs';
import { serializeJson, atomicWrite, readJson } from './lib/json-io.mjs';

// Verdict/transition applier: owns every write to state.json and to task-frontmatter
// status/builtAgainst. Verdict CONTENT (dimensions, failed checks, waivers) comes from
// the LLM/HIL via --verdict-file; the validatedHash is always injected from a fresh
// hasher run here, so a stale or hand-typed hash can never be recorded as validated.
//
// Two-phase apply for /fd:to-tasks:
//   fill      — after generation, BEFORE validators: writes real builtAgainst hashes over
//               the sha256:pending placeholders (hash-stable: builtAgainst is not part of
//               the inputHash contract).
//   finalize  — after the verdict: flips planned/stale → ready, reprojects the manifest
//               with fresh task hashes, records readiness.tasks / phase / tasksHash.

const SCHEMA_DIR = path.join(import.meta.dirname, '..', 'schemas');

export class ApplyError extends Error {}

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'));
}

function statePath(dir) {
  return path.join(dir, 'state.json');
}

function readState(dir) {
  const state = readJson(statePath(dir));
  if (!state) throw new ApplyError(`state.json not found in ${dir}`);
  return state;
}

function writeState(dir, state) {
  assertValid(state, loadSchema('state.schema.json'), 'state.json');
  atomicWrite(statePath(dir), serializeJson(state));
}

function readVerdictFile(file) {
  const verdict = readJson(path.resolve(file));
  if (!verdict) throw new ApplyError(`verdict file not found or empty: ${file}`);
  for (const key of ['verdict', 'dimensionsRun', 'failedChecks', 'waivedChecks']) {
    if (!(key in verdict)) throw new ApplyError(`verdict file is missing "${key}"`);
  }
  if (verdict.verdict !== 'ready' && verdict.verdict !== 'blocked') {
    throw new ApplyError(`verdict must be "ready" or "blocked", got ${JSON.stringify(verdict.verdict)}`);
  }
  return verdict;
}

function verdictRecord(verdict, validatedHash) {
  return {
    verdict: verdict.verdict,
    validatedHash,
    dimensionsRun: verdict.dimensionsRun,
    failedChecks: verdict.failedChecks,
    waivedChecks: verdict.waivedChecks,
  };
}

export function applyFill(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const hasherOut = runHasher(dir, { featuresRoot: options.featuresRoot });
  if (hasherOut.specHash == null) {
    throw new ApplyError('cannot fill builtAgainst from an empty spec (specHash is null)');
  }
  const filled = [];
  for (const t of readTaskFrontmatters(dir)) {
    const entry = hasherOut.tasks[t.id];
    if (!entry) continue;
    const text = fs.readFileSync(t.file, 'utf8');
    const next = setFrontmatterFields(text, {
      builtAgainst: { specHash: hasherOut.specHash, inputHash: entry.inputHash },
    });
    if (next !== text) atomicWrite(t.file, next);
    filled.push(t.id);
  }
  return { filled, specHash: hasherOut.specHash };
}

export function applyFinalize(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const verdict = readVerdictFile(options.verdictFile);
  const state = readState(dir);

  if (verdict.verdict !== 'ready') {
    const hasherOut = runHasher(dir, { featuresRoot: options.featuresRoot });
    if (!hasherOut.tasksHash) throw new ApplyError('no tasks to record a verdict for (tasksHash is null)');
    state.readiness = { ...(state.readiness ?? {}), tasks: verdictRecord(verdict, hasherOut.tasksHash) };
    writeState(dir, state);
    return { verdict: verdict.verdict, tasksHash: hasherOut.tasksHash, phase: state.phase, readyTasks: [] };
  }

  const readyTasks = [];
  for (const t of readTaskFrontmatters(dir)) {
    if (t.status === 'planned' || t.status === 'stale') {
      const text = fs.readFileSync(t.file, 'utf8');
      atomicWrite(t.file, setFrontmatterFields(text, { status: 'ready' }));
      readyTasks.push(t.id);
    }
  }

  const projected = runBuildManifest(dir, {
    featuresRoot: options.featuresRoot,
    refreshTaskHashes: true,
    finalizeReady: true,
  });
  if (!projected.tasksHash) throw new ApplyError('no tasks to finalize (tasksHash is null)');

  state.readiness = { ...(state.readiness ?? {}), tasks: verdictRecord(verdict, projected.tasksHash) };
  state.tasksHash = projected.tasksHash;
  if (state.phase === 'spec') state.phase = 'tasks';
  writeState(dir, state);
  return {
    verdict: verdict.verdict,
    tasksHash: projected.tasksHash,
    phase: state.phase,
    readyTasks,
    warnings: projected.warnings,
  };
}

export function applyReadinessSpec(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const verdict = readVerdictFile(options.verdictFile);
  const hasherOut = runHasher(dir, { featuresRoot: options.featuresRoot });
  if (hasherOut.specHash == null) {
    throw new ApplyError('cannot record a spec verdict for an empty spec (specHash is null)');
  }
  const state = readState(dir);
  state.readiness = { ...(state.readiness ?? {}), spec: verdictRecord(verdict, hasherOut.specHash) };
  state.specHash = hasherOut.specHash;
  writeState(dir, state);
  return { verdict: verdict.verdict, specHash: hasherOut.specHash };
}

function readPlanFile(file) {
  const plan = readJson(path.resolve(file));
  if (!plan) throw new ApplyError(`plan file not found or empty: ${file}`);
  return {
    drop: Array.isArray(plan.drop) ? plan.drop : [],
    stale: Array.isArray(plan.stale) ? plan.stale : [],
    bumpVersions: Array.isArray(plan.bumpVersions) ? plan.bumpVersions : [],
  };
}

// Executes a HIL-approved reconcile plan. The @v bump lives ONLY here: touching a
// delivered element is a BLOCK by default upstream, and the bump is the mechanism a
// human explicitly unlocks — never an automatic projection side effect.
export function applyReconcile(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const plan = readPlanFile(options.planFile);
  const manifestPath = path.join(dir, 'feature.lock.json');
  const manifest = readJson(manifestPath);
  if (!manifest) throw new ApplyError(`feature.lock.json not found in ${dir}`);

  const dropped = [];
  for (const id of plan.drop) {
    const task = manifest.tasks[id];
    if (!task) throw new ApplyError(`cannot drop unknown task ${id}`);
    task.status = 'dropped';
    const file = path.join(dir, 'tasks', `${id}.md`);
    if (fs.existsSync(file)) fs.rmSync(file);
    dropped.push(id);
  }

  const staled = [];
  for (const id of plan.stale) {
    const task = manifest.tasks[id];
    if (!task) throw new ApplyError(`cannot mark unknown task ${id} stale`);
    if (task.status === 'shipped' || task.status === 'dropped') continue;
    task.status = 'stale';
    staled.push(id);
  }

  const bumped = [];
  for (const el of plan.bumpVersions) {
    const entry = manifest.elements[el];
    if (!entry) throw new ApplyError(`cannot bump version of unknown element ${el}`);
    entry.version += 1;
    bumped.push(`${el}@v${entry.version}`);
  }

  assertValid(manifest, loadSchema('feature-lock.schema.json'), 'feature.lock.json');
  atomicWrite(manifestPath, serializeJson(manifest));
  return { dropped, staled, bumped };
}

export function applySeedState(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const file = statePath(dir);
  if (readJson(file)) return { written: false, path: file, note: 'state.json already exists' };
  for (const key of ['slug', 'title', 'language', 'createdFrom']) {
    if (!options[key]) throw new ApplyError(`seed-state requires --${key === 'createdFrom' ? 'created-from' : key}`);
  }
  const state = {
    schema: 1,
    slug: options.slug,
    title: options.title,
    language: options.language,
    createdFrom: options.createdFrom,
    phase: 'spec',
    boundedContext: options.boundedContext ?? null,
    branch: null,
    specHash: null,
    tasksHash: null,
    waveInProgress: false,
    manifest: 'feature.lock.json',
  };
  writeState(dir, state);
  return { written: true, path: file };
}

const VERBS = {
  'fill': (dir, o) => applyFill(dir, o),
  'finalize': (dir, o) => applyFinalize(dir, o),
  'readiness-spec': (dir, o) => applyReadinessSpec(dir, o),
  'reconcile': (dir, o) => applyReconcile(dir, o),
  'seed-state': (dir, o) => applySeedState(dir, o),
};

function parseCliArgs(argv) {
  const args = { verb: null, featureDir: null, options: {} };
  const o = args.options;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verdict-file') o.verdictFile = argv[++i];
    else if (a === '--plan-file') o.planFile = argv[++i];
    else if (a === '--features-root') o.featuresRoot = argv[++i];
    else if (a === '--slug') o.slug = argv[++i];
    else if (a === '--title') o.title = argv[++i];
    else if (a === '--language') o.language = argv[++i];
    else if (a === '--created-from') o.createdFrom = argv[++i];
    else if (a === '--bounded-context') o.boundedContext = argv[++i];
    else if (!args.verb) args.verb = a;
    else if (!args.featureDir) args.featureDir = a;
  }
  return args;
}

function main() {
  const { verb, featureDir, options } = parseCliArgs(process.argv.slice(2));
  if (!verb || !featureDir || !VERBS[verb]) {
    process.stdout.write(JSON.stringify({
      error: 'usage: apply.mjs <fill|finalize|readiness-spec|reconcile|seed-state> <featureDir> '
        + '[--verdict-file F] [--plan-file F] [--features-root D] '
        + '[--slug S --title T --language L --created-from topic|docs [--bounded-context C]]',
    }) + '\n');
    process.exit(1);
  }
  try {
    process.stdout.write(JSON.stringify(VERBS[verb](featureDir, options)) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

function isMain() {
  return process.argv[1] ? path.resolve(process.argv[1]) === import.meta.filename : false;
}

if (isMain()) main();

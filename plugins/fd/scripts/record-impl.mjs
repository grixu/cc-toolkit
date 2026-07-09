#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertValid } from './lib/validate.mjs';
import { serializeJson, atomicWrite, readJson, compareIds } from './lib/json-io.mjs';

// Surgical patcher for the implement/ship phase. It never recomputes hashes and never
// touches task files: the spec is frozen while implementing, and /fd:implement's
// drift-BLOCK precondition must have run before any of these writes — recomputing here
// would repaint over exactly the drift that gate exists to catch.

const SCHEMA_DIR = path.join(import.meta.dirname, '..', 'schemas');

export class RecordImplError extends Error {}

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'));
}

function readManifest(dir) {
  const manifest = readJson(path.join(dir, 'feature.lock.json'));
  if (!manifest) throw new RecordImplError(`feature.lock.json not found in ${dir}`);
  return manifest;
}

function writeManifest(dir, manifest) {
  assertValid(manifest, loadSchema('feature-lock.schema.json'), 'feature.lock.json');
  atomicWrite(path.join(dir, 'feature.lock.json'), serializeJson(manifest));
}

function readState(dir) {
  const state = readJson(path.join(dir, 'state.json'));
  if (!state) throw new RecordImplError(`state.json not found in ${dir}`);
  return state;
}

function writeState(dir, state) {
  assertValid(state, loadSchema('state.schema.json'), 'state.json');
  atomicWrite(path.join(dir, 'state.json'), serializeJson(state));
}

function taskOf(manifest, id) {
  const task = manifest.tasks[id];
  if (!task) throw new RecordImplError(`unknown task ${id}`);
  return task;
}

export function recordTask(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const ids = options.tasks ?? [];
  if (ids.length === 0) throw new RecordImplError('record requires --task');
  if ((options.commits?.length ?? 0) > 0 && ids.length > 1) {
    throw new RecordImplError('--commit applies to a single --task');
  }
  const manifest = readManifest(dir);
  for (const id of ids) {
    const task = taskOf(manifest, id);
    if (options.commits?.length) {
      const impl = task.impl ?? { commits: [] };
      impl.commits = options.append
        ? [...new Set([...impl.commits, ...options.commits])]
        : [...options.commits];
      task.impl = impl;
    }
    if (options.gate || options.cr) {
      task.impl = task.impl ?? { commits: [] };
      // gate = the wave gate (smoke + AC verification), NOT the full CI pipeline —
      // that runs once per feature at close and lands in state.close via the close verb.
      if (options.gate) task.impl.gate = options.gate;
      if (options.cr) task.impl.cr = options.cr;
    }
    if (options.status) task.status = options.status;
  }
  writeManifest(dir, manifest);
  return { recorded: ids, status: options.status ?? null };
}

export function recordShip(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const ids = options.tasks ?? [];
  if (ids.length === 0) throw new RecordImplError('ship requires --task');
  const manifest = readManifest(dir);
  for (const id of ids) {
    taskOf(manifest, id).status = 'shipped';
  }
  const delivered = [];
  for (const [el, hash] of Object.entries(options.deliver ?? {})) {
    const entry = manifest.elements[el];
    if (!entry) throw new RecordImplError(`unknown element ${el}`);
    entry.deliveredHash = hash;
    entry.hash = hash;
    entry.status = 'delivered';
    delivered.push(el);
  }
  writeManifest(dir, manifest);

  const live = Object.values(manifest.tasks).filter((t) => t.status !== 'dropped');
  const allShipped = live.length > 0 && live.every((t) => t.status === 'shipped');
  if (allShipped) {
    const state = readState(dir);
    state.phase = 'shipped';
    writeState(dir, state);
  }
  return { shipped: ids, delivered, phase: allShipped ? 'shipped' : null };
}

export function recordPhase(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  if (!options.phase && options.waveInProgress === undefined) {
    throw new RecordImplError('phase requires --phase and/or --wave-in-progress');
  }
  const state = readState(dir);
  if (options.phase) {
    if (options.phase !== 'implementing' && options.phase !== 'shipped') {
      throw new RecordImplError(`phase verb only sets "implementing" or "shipped", got ${JSON.stringify(options.phase)}`);
    }
    state.phase = options.phase;
  }
  if (options.waveInProgress !== undefined) state.waveInProgress = options.waveInProgress;
  writeState(dir, state);
  return { phase: state.phase, waveInProgress: state.waveInProgress };
}

// Feature-level close verdicts (the feature's FIRST full CI, the code review, and the
// final CI after autosquash). Recorded incrementally: an escalated close (e.g. a
// cr-judgment after a green full CI) persists what already ran. AC waivers land here
// too — they are human-only (an AskUserQuestion decision relayed by the main thread,
// never an agent's call).
export function recordClose(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const updates = {};
  for (const key of ['fullCi', 'cr', 'finalCi']) {
    if (options[key] === undefined) continue;
    if (options[key] !== 'pass' && options[key] !== 'fail') {
      throw new RecordImplError(`close ${key} must be "pass" or "fail", got ${JSON.stringify(options[key])}`);
    }
    updates[key] = options[key];
  }
  const waived = options.waive ?? [];
  for (const id of waived) {
    if (!/^AC-\d+$/.test(id)) {
      throw new RecordImplError(`--waive expects AC ids (AC-<n>), got ${JSON.stringify(id)}`);
    }
  }
  if (Object.keys(updates).length === 0 && waived.length === 0) {
    throw new RecordImplError('close requires at least one of --full-ci, --cr, --final-ci, --waive');
  }
  const state = readState(dir);
  state.close = { ...(state.close ?? {}), ...updates };
  if (waived.length > 0) {
    const at = options.at ?? new Date().toISOString();
    // Re-waiving an AC replaces its entry — the latest HIL decision wins.
    const kept = (state.close.waivedAcs ?? []).filter((w) => !waived.includes(w.id));
    const fresh = waived.map((id) => {
      const w = { id, by: 'user', at };
      if (options.reason) w.reason = options.reason;
      return w;
    });
    state.close.waivedAcs = [...kept, ...fresh].sort((a, b) => compareIds(a.id, b.id));
  }
  writeState(dir, state);
  return { close: state.close };
}

// Branch adoption/creation goes through here — never a hand Edit of state.json.
export function recordBranch(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  if (typeof options.set !== 'string' || options.set === '') {
    throw new RecordImplError('branch requires --set <branch-name>');
  }
  const state = readState(dir);
  state.branch = options.set;
  writeState(dir, state);
  return { branch: state.branch };
}

const VERBS = {
  'record': (dir, o) => recordTask(dir, o),
  'ship': (dir, o) => recordShip(dir, o),
  'phase': (dir, o) => recordPhase(dir, o),
  'close': (dir, o) => recordClose(dir, o),
  'branch': (dir, o) => recordBranch(dir, o),
};

function parseCliArgs(argv) {
  const args = { verb: null, featureDir: null, options: { commits: [] } };
  const o = args.options;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') o.tasks = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--commit') o.commits.push(argv[++i]);
    else if (a === '--append') o.append = true;
    else if (a === '--status') o.status = argv[++i];
    else if (a === '--gate') o.gate = argv[++i];
    else if (a === '--cr') o.cr = argv[++i];
    else if (a === '--full-ci') o.fullCi = argv[++i];
    else if (a === '--final-ci') o.finalCi = argv[++i];
    else if (a === '--waive') o.waive = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--reason') o.reason = argv[++i];
    else if (a === '--at') o.at = argv[++i];
    else if (a === '--set') o.set = argv[++i];
    else if (a === '--deliver') {
      o.deliver = {};
      for (const pair of argv[++i].split(',')) {
        const eq = pair.indexOf('=');
        if (eq <= 0) continue;
        o.deliver[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
    } else if (a === '--phase') o.phase = argv[++i];
    else if (a === '--wave-in-progress') o.waveInProgress = argv[++i] === 'true';
    else if (!args.verb) args.verb = a;
    else if (!args.featureDir) args.featureDir = a;
  }
  return args;
}

function main() {
  const { verb, featureDir, options } = parseCliArgs(process.argv.slice(2));
  if (!verb || !featureDir || !VERBS[verb]) {
    process.stdout.write(JSON.stringify({
      error: 'usage: record-impl.mjs <record|ship|phase|close|branch> <featureDir> '
        + '[--task T-1[,T-2]] [--commit SHA]... [--append] [--status S] [--gate pass|fail] [--cr pass|fail] '
        + '[--deliver EL=sha256:...,...] [--phase implementing|shipped] [--wave-in-progress true|false] '
        + '[--full-ci pass|fail] [--final-ci pass|fail] [--waive AC-1[,AC-2] --reason "..." [--at ISO]] [--set <branch>]',
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

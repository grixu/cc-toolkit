#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runHasher, parseTaskFrontmatter, SEED_KINDS } from './hasher.mjs';
import { assertValid } from './lib/validate.mjs';
import { serializeJson, atomicWrite, compareIds, readJson } from './lib/json-io.mjs';

// The single projector of feature.lock.json. Commands never hand-assemble the manifest:
// this script owns idCounters (append-only), producer derivation, element/task sections,
// and spec.history. It projects hashes computed by the hasher; it never invents them.
//
// Existing task entries keep their stored inputHash/contentHash/specHash unless
// --refresh-task-hashes is passed: those stored values are the staleness baseline that
// downstream commands diff against fresh hasher output — refreshing them outside a
// /fd:to-tasks apply would erase the drift signal.

const SCHEMA_DIR = path.join(import.meta.dirname, '..', 'schemas');

export class BuildManifestError extends Error {}

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'));
}

function sortKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort(compareIds)) out[k] = obj[k];
  return out;
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string');
  if (typeof value === 'string' && value) return [value];
  return [];
}

export function seedManifest() {
  return {
    schema: 1,
    spec: { hash: null, history: [] },
    idCounters: Object.fromEntries(SEED_KINDS.map((k) => [k, 0])),
    elements: {},
    tasks: {},
  };
}

// Append-only high-water marks: the key set never shrinks (HIL-added kinds survive spec
// edits) and each counter's floor is its prior value, so deleting the highest-numbered
// element or task never frees its number for reuse.
export function bumpCounters(priorCounters, presentElementIds, presentTaskIds) {
  const base = priorCounters && Object.keys(priorCounters).length > 0
    ? priorCounters
    : Object.fromEntries(SEED_KINDS.map((k) => [k, 0]));
  const counters = { ...base };
  for (const id of presentElementIds) {
    const sep = id.lastIndexOf('-');
    if (sep <= 0) continue;
    const kind = id.slice(0, sep);
    const num = Number(id.slice(sep + 1));
    if (Number.isFinite(num)) counters[kind] = Math.max(counters[kind] ?? 0, num);
  }
  for (const id of presentTaskIds) {
    const num = Number(id.slice(id.indexOf('-') + 1));
    if (Number.isFinite(num)) counters.T = Math.max(counters.T ?? 0, num);
  }
  return counters;
}

export function deriveProducers(taskFrontmatters) {
  const producers = {};
  for (const t of taskFrontmatters) {
    for (const el of t.produces) {
      if (producers[el] && producers[el] !== t.id) {
        throw new BuildManifestError(`element ${el} has two producers: ${producers[el]} and ${t.id}`);
      }
      producers[el] = t.id;
    }
  }
  return producers;
}

// Version never bumps here — a breaking @v bump is a human decision applied by
// `apply.mjs reconcile` from a HIL-approved plan. A delivered element whose fresh hash
// left its deliveredHash reads as drifted; returning to it reads as delivered again.
// Pending elements that vanished from the spec drop out (pre-delivery the spec is the
// truth); delivered ones are retained so the delivery record is never lost.
export function projectElements(priorElements, freshHashes, producers) {
  const warnings = [];
  const out = {};
  for (const id of Object.keys(freshHashes)) {
    const prior = priorElements?.[id];
    const hash = freshHashes[id];
    const entry = { hash, version: prior?.version ?? 1, status: 'pending' };
    if (prior?.deliveredHash) {
      entry.deliveredHash = prior.deliveredHash;
      entry.status = hash === prior.deliveredHash ? 'delivered' : 'drifted';
    }
    const producer = producers[id] ?? prior?.producer;
    if (producer) entry.producer = producer;
    out[id] = entry;
  }
  for (const id of Object.keys(priorElements ?? {})) {
    if (out[id]) continue;
    const prior = priorElements[id];
    if (prior.status === 'delivered' || prior.status === 'drifted') {
      out[id] = prior;
      warnings.push({ element: id, reason: 'delivered-element-missing-from-spec' });
    }
  }
  return { elements: sortKeys(out), warnings };
}

export function projectTasks(priorTasks, taskFrontmatters, hasherTasks, specHash, options = {}) {
  const { finalizeReady = false, refreshTaskHashes = false } = options;
  const warnings = [];
  const out = {};
  for (const t of taskFrontmatters) {
    const prior = priorTasks?.[t.id];
    if (prior && !refreshTaskHashes) {
      out[t.id] = prior;
      continue;
    }
    let status = prior?.status ?? (t.status || 'planned');
    if (finalizeReady && (status === 'planned' || status === 'stale')) status = 'ready';
    const entry = {
      identityKey: [...t.produces].sort(compareIds),
      produces: t.produces,
      consumes: t.consumes,
      covers: t.covers,
      inputHash: hasherTasks[t.id].inputHash,
      contentHash: hasherTasks[t.id].contentHash,
      specHash,
      status,
    };
    if (prior?.oversized !== undefined) entry.oversized = prior.oversized;
    if (prior?.impl) entry.impl = prior.impl;
    out[t.id] = entry;
  }
  for (const id of Object.keys(priorTasks ?? {})) {
    if (out[id]) continue;
    out[id] = priorTasks[id];
    // dropped tasks legitimately have no file — only a live task losing its file is news
    if (priorTasks[id].status !== 'dropped') warnings.push({ task: id, reason: 'file-missing' });
  }
  return { tasks: sortKeys(out), warnings };
}

export function diffElements(priorElements, nextElements) {
  const added = [];
  const removed = [];
  const modified = [];
  let unchanged = 0;
  for (const id of Object.keys(nextElements)) {
    const prior = priorElements?.[id];
    if (!prior) added.push(id);
    else if (prior.hash !== nextElements[id].hash) modified.push(id);
    else unchanged++;
  }
  for (const id of Object.keys(priorElements ?? {})) {
    if (!nextElements[id]) removed.push(id);
  }
  return {
    added: added.sort(compareIds),
    removed: removed.sort(compareIds),
    modified: modified.sort(compareIds),
    unchanged,
  };
}

export function buildManifest({ prior, hasherOut, taskFrontmatters, historySummary, at, finalizeReady, refreshTaskHashes }) {
  const base = prior ?? seedManifest();
  const producers = deriveProducers(taskFrontmatters);
  const { elements, warnings: elementWarnings } =
    projectElements(base.elements ?? {}, hasherOut.elements, producers);
  const { tasks, warnings: taskWarnings } =
    projectTasks(base.tasks ?? {}, taskFrontmatters, hasherOut.tasks, hasherOut.specHash, { finalizeReady, refreshTaskHashes });
  const warnings = [...elementWarnings, ...taskWarnings];

  const history = [...(base.spec?.history ?? [])];
  if (historySummary) {
    if (hasherOut.specHash == null) {
      warnings.push({ reason: 'empty-spec-no-history' });
    } else if (history.length === 0 || history[history.length - 1].hash !== hasherOut.specHash) {
      history.push({ hash: hasherOut.specHash, at, summary: historySummary });
    }
  }

  const manifest = {
    schema: 1,
    spec: { hash: hasherOut.specHash, history },
    idCounters: bumpCounters(base.idCounters, Object.keys(elements), Object.keys(tasks)),
    elements,
    tasks,
  };
  if (base.scMap !== undefined) manifest.scMap = base.scMap;
  if (base.upstream !== undefined) manifest.upstream = base.upstream;
  return { manifest, producers, warnings };
}

export function readTaskFrontmatters(featureDir) {
  const tasksDir = path.join(featureDir, 'tasks');
  const out = [];
  if (!fs.existsSync(tasksDir) || !fs.statSync(tasksDir).isDirectory()) return out;
  for (const file of fs.readdirSync(tasksDir).filter((f) => f.endsWith('.md')).sort()) {
    const text = fs.readFileSync(path.join(tasksDir, file), 'utf8');
    const { frontmatter } = parseTaskFrontmatter(text);
    const id = typeof frontmatter.id === 'string' && frontmatter.id
      ? frontmatter.id
      : path.basename(file, '.md');
    out.push({
      id,
      produces: asStringArray(frontmatter.produces),
      consumes: asStringArray(frontmatter.consumes),
      covers: asStringArray(frontmatter.covers),
      status: typeof frontmatter.status === 'string' ? frontmatter.status : '',
      file: path.join(tasksDir, file),
    });
  }
  return out;
}

export function runBuildManifest(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const manifestPath = path.join(dir, 'feature.lock.json');
  const prior = readJson(manifestPath);
  const schema = loadSchema('feature-lock.schema.json');

  if (options.seed) {
    if (prior) return { written: false, path: manifestPath, note: 'manifest already exists' };
    const manifest = seedManifest();
    assertValid(manifest, schema, 'feature.lock.json');
    atomicWrite(manifestPath, serializeJson(manifest));
    return { written: true, path: manifestPath, counters: manifest.idCounters };
  }

  if (options.addKind) {
    if (!prior) throw new BuildManifestError('no manifest to add a KIND to — seed it first');
    if (!/^[A-Z]{2,16}$/.test(options.addKind)) {
      throw new BuildManifestError(`invalid KIND ${JSON.stringify(options.addKind)} — expected 2-16 uppercase letters`);
    }
    if (!(options.addKind in prior.idCounters)) prior.idCounters[options.addKind] = 0;
    assertValid(prior, schema, 'feature.lock.json');
    atomicWrite(manifestPath, serializeJson(prior));
    return { written: true, path: manifestPath, counters: prior.idCounters };
  }

  const hasherOut = runHasher(dir, { featuresRoot: options.featuresRoot });
  if (hasherOut.unknownKinds.length > 0) {
    throw new BuildManifestError(
      `unknown KINDs in spec: ${hasherOut.unknownKinds.join(', ')} — resolve via HIL (--add-kind or fix the spec)`,
    );
  }

  const taskFrontmatters = readTaskFrontmatters(dir);
  const { manifest, producers, warnings } = buildManifest({
    prior,
    hasherOut,
    taskFrontmatters,
    historySummary: options.historySummary,
    at: options.at ?? new Date().toISOString(),
    finalizeReady: options.finalizeReady,
    refreshTaskHashes: options.refreshTaskHashes,
  });
  for (const m of hasherOut.malformedAnchors) {
    warnings.push({ reason: 'malformed-anchor', line: m.line, text: m.text });
  }

  const result = {
    written: !options.stdout,
    path: manifestPath,
    specHash: hasherOut.specHash,
    tasksHash: hasherOut.tasksHash,
    unknownKinds: [],
    counters: manifest.idCounters,
    producers,
    diff: diffElements(prior?.elements ?? {}, manifest.elements),
    warnings,
  };
  if (options.stdout) return { ...result, manifest };
  assertValid(manifest, schema, 'feature.lock.json');
  atomicWrite(manifestPath, serializeJson(manifest));
  return result;
}

function parseCliArgs(argv) {
  const args = {
    featureDir: null, seed: false, addKind: null, historySummary: null,
    at: null, featuresRoot: null, stdout: false, refreshTaskHashes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') args.seed = true;
    else if (argv[i] === '--add-kind') args.addKind = argv[++i];
    else if (argv[i] === '--history-summary') args.historySummary = argv[++i];
    else if (argv[i] === '--at') args.at = argv[++i];
    else if (argv[i] === '--features-root') args.featuresRoot = argv[++i];
    else if (argv[i] === '--stdout') args.stdout = true;
    else if (argv[i] === '--refresh-task-hashes') args.refreshTaskHashes = true;
    else if (!args.featureDir) args.featureDir = argv[i];
  }
  return args;
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.featureDir) {
    process.stdout.write(JSON.stringify({
      error: 'usage: build-manifest.mjs <featureDir> [--seed] [--add-kind K] [--history-summary S] [--at ISO] [--features-root <dir>] [--refresh-task-hashes] [--stdout]',
    }) + '\n');
    process.exit(1);
  }
  try {
    const res = runBuildManifest(args.featureDir, {
      seed: args.seed,
      addKind: args.addKind || undefined,
      historySummary: args.historySummary || undefined,
      at: args.at || undefined,
      featuresRoot: args.featuresRoot || undefined,
      stdout: args.stdout,
      refreshTaskHashes: args.refreshTaskHashes,
    });
    process.stdout.write(JSON.stringify(res) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

function isMain() {
  return process.argv[1] ? path.resolve(process.argv[1]) === import.meta.filename : false;
}

if (isMain()) main();

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Seed KIND dictionary (SPEC.md §4.3). Used when the manifest carries no idCounters.
export const SEED_KINDS = [
  'DB', 'API', 'CONFIG', 'OBSERVABILITY', 'INFRASTRUCTURE', 'INTEGRATION', 'MODULE',
  'DESIGN', 'AC', 'FR', 'NFR', 'T',
];

// The dash in an anchor is an em dash (U+2014) fenced by single spaces.
const ANCHOR_RE = /^(#{1,6}) ([A-Z]{2,16})-([1-9][0-9]*) — /;
const HEADING_RE = /^(#{1,6}) /;

export class HasherError extends Error {}

function sha256(text) {
  return 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');
}

export function normalize(text) {
  const unified = text.replace(/\r\n?/g, '\n');
  const lines = unified.split('\n').map((line) => line.replace(/[ \t]+$/, ''));
  const collapsed = [];
  for (const line of lines) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(line);
  }
  while (collapsed.length > 0 && collapsed[0] === '') collapsed.shift();
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.join('\n').normalize('NFC');
}

export function hashElement(content) {
  return sha256(normalize(content));
}

export function contentHash(fileText) {
  return sha256(normalize(fileText));
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

export function rollup(map) {
  if (Object.keys(map).length === 0) return null;
  return sha256(canonicalJson(map));
}

function buildResolvedMap(keys, resolve) {
  const map = {};
  for (const key of keys || []) map[key] = resolve(key);
  return map;
}

export function inputHash(contract, resolveHash) {
  const consumes = buildResolvedMap(contract.consumes, (k) => resolveHash('consumes', k));
  const covers = buildResolvedMap(contract.covers, (k) => resolveHash('covers', k));
  const produces = buildResolvedMap(contract.produces, (k) => resolveHash('produces', k));
  return sha256(canonicalJson({ consumes, covers, produces }));
}

export function extractElements(specText, kindDict) {
  const dict = kindDict instanceof Set ? kindDict : new Set(kindDict);
  const lines = specText.replace(/\r\n?/g, '\n').split('\n');
  const levels = lines.map((line) => {
    const m = HEADING_RE.exec(line);
    return m ? m[1].length : 0;
  });

  const elements = [];
  const unknownKinds = [];
  const unknownSeen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const m = ANCHOR_RE.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    const kind = m[2];
    if (!dict.has(kind)) {
      if (!unknownSeen.has(kind)) {
        unknownSeen.add(kind);
        unknownKinds.push(kind);
      }
      continue;
    }
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (levels[j] > 0 && levels[j] <= level) {
        end = j;
        break;
      }
    }
    elements.push({
      id: `${kind}-${m[3]}`,
      kind,
      level,
      title: lines[i].slice(m[0].length),
      content: lines.slice(i, end).join('\n'),
    });
  }
  return { elements, unknownKinds };
}

export function parseTaskFrontmatter(fileText) {
  const normalized = fileText.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!match) return { frontmatter: {}, body: fileText };
  return {
    frontmatter: parseYamlBlock(match[1]),
    body: normalized.slice(match[0].length),
  };
}

function parseYamlBlock(text) {
  const result = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/[ \t]+$/, '');
    if (line === '' || /^\s*#/.test(line) || /^\s/.test(rawLine)) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    result[m[1]] = parseYamlValue(m[2]);
  }
  return result;
}

function parseYamlValue(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner).map((item) => parseScalar(item.trim()));
  }
  if (v.startsWith('{') && v.endsWith('}')) {
    const obj = {};
    const inner = v.slice(1, -1).trim();
    if (inner === '') return obj;
    for (const pair of splitTopLevel(inner)) {
      const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(pair.trim());
      if (m) obj[m[1]] = parseYamlValue(m[2]);
    }
    return obj;
  }
  return parseScalar(v);
}

function parseScalar(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of str) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '[' || ch === '{') {
      depth++;
      current += ch;
    } else if (ch === ']' || ch === '}') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function stripVersion(s) {
  const at = s.lastIndexOf('@');
  return at >= 0 ? s.slice(0, at) : s;
}

function parseConsumesRef(ref) {
  const hashIdx = ref.indexOf('#');
  if (hashIdx >= 0) {
    return { kind: 'cross', slug: ref.slice(0, hashIdx), el: stripVersion(ref.slice(hashIdx + 1)) };
  }
  const sep = ref.indexOf('::');
  const rest = sep >= 0 ? ref.slice(sep + 2) : ref;
  return { kind: 'intra', el: stripVersion(rest) };
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, 'utf8');
  if (raw.trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new HasherError(`Invalid JSON in ${manifestPath}: ${err.message}`);
  }
}

function manifestKindDict(manifest) {
  if (manifest && manifest.idCounters && typeof manifest.idCounters === 'object') {
    const keys = Object.keys(manifest.idCounters);
    if (keys.length > 0) return keys;
  }
  return SEED_KINDS;
}

function crossFeatureHash(featuresRoot, slug, el, cache) {
  let manifest;
  if (cache.has(slug)) {
    manifest = cache.get(slug);
  } else {
    manifest = readManifest(path.join(featuresRoot, slug, 'feature.lock.json'));
    cache.set(slug, manifest);
  }
  const hash = manifest && manifest.elements && manifest.elements[el] && manifest.elements[el].hash;
  return typeof hash === 'string' ? hash : null;
}

function upstreamPinHash(upstream, slug, el) {
  for (const entry of upstream) {
    if (entry && entry.slug === slug && entry.elements && entry.elements[el]) {
      const hash = entry.elements[el].hash;
      if (typeof hash === 'string') return hash;
    }
  }
  return null;
}

// produces/covers and intra-consumed elements resolve to their fresh spec.md hash;
// a referenced element absent from the current spec yields null so the input_hash still
// computes (marking the task stale) rather than crashing the read-only hasher every
// command runs on entry. Cross-feature refs follow the pinned chain and error when they
// cannot be resolved at all — there is no local content to hash.
function makeResolver(elementsMap, upstream, featuresRoot) {
  const manifestCache = new Map();
  return (category, key) => {
    if (category === 'produces' || category === 'covers') {
      return elementsMap[key] ?? null;
    }
    const ref = parseConsumesRef(key);
    if (ref.kind === 'intra') {
      return elementsMap[ref.el] ?? null;
    }
    const live = crossFeatureHash(featuresRoot, ref.slug, ref.el, manifestCache);
    if (live) return live;
    const pinned = upstreamPinHash(upstream, ref.slug, ref.el);
    if (pinned) return pinned;
    throw new HasherError(`Unresolvable cross-feature consumes ref: ${key}`);
  };
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string');
  if (typeof value === 'string' && value) return [value];
  return [];
}

export function runHasher(featureDir, options = {}) {
  const dir = path.resolve(featureDir);
  const specPath = path.join(dir, 'spec.md');
  if (!fs.existsSync(specPath)) {
    throw new HasherError(`spec.md not found in ${dir}`);
  }
  const specText = fs.readFileSync(specPath, 'utf8');

  const manifest = readManifest(path.join(dir, 'feature.lock.json'));
  const kindDict = manifestKindDict(manifest);
  const upstream = manifest && Array.isArray(manifest.upstream) ? manifest.upstream : [];
  const featuresRoot = options.featuresRoot ? path.resolve(options.featuresRoot) : path.dirname(dir);

  const { elements, unknownKinds } = extractElements(specText, kindDict);
  const elementsMap = {};
  for (const el of elements) elementsMap[el.id] = hashElement(el.content);
  const specHash = rollup(elementsMap);

  const resolve = makeResolver(elementsMap, upstream, featuresRoot);
  const tasks = {};
  const tasksInput = {};
  const tasksDir = path.join(dir, 'tasks');
  if (fs.existsSync(tasksDir) && fs.statSync(tasksDir).isDirectory()) {
    const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.md')).sort();
    for (const file of files) {
      const text = fs.readFileSync(path.join(tasksDir, file), 'utf8');
      const { frontmatter } = parseTaskFrontmatter(text);
      const id = typeof frontmatter.id === 'string' && frontmatter.id
        ? frontmatter.id
        : path.basename(file, '.md');
      const ih = inputHash(
        {
          produces: asStringArray(frontmatter.produces),
          consumes: asStringArray(frontmatter.consumes),
          covers: asStringArray(frontmatter.covers),
        },
        resolve,
      );
      tasks[id] = { inputHash: ih, contentHash: contentHash(text) };
      tasksInput[id] = ih;
    }
  }

  return { elements: elementsMap, specHash, unknownKinds, tasks, tasksHash: rollup(tasksInput) };
}

function parseCliArgs(argv) {
  const args = { featureDir: null, featuresRoot: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--features-root') {
      args.featuresRoot = argv[++i];
    } else if (!args.featureDir) {
      args.featureDir = argv[i];
    }
  }
  return args;
}

function main() {
  const { featureDir, featuresRoot } = parseCliArgs(process.argv.slice(2));
  if (!featureDir) {
    process.stdout.write(JSON.stringify({ error: 'usage: hasher.mjs <featureDir> [--features-root <dir>]' }) + '\n');
    process.exit(1);
  }
  try {
    process.stdout.write(JSON.stringify(runHasher(featureDir, { featuresRoot: featuresRoot || undefined })) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

// Detect direct invocation without node:url (outside the allowed builtin set).
function isMain() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === decodeURIComponent(new URL(import.meta.url).pathname);
}

if (isMain()) main();

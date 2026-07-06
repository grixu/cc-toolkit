import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHasher } from '../scripts/hasher.mjs';
import { computeProjections, runProjectMaps, serializeJson } from '../scripts/project-maps.mjs';

const HERE = import.meta.dirname;
const MAPS = path.join(HERE, 'fixtures', 'maps');
const BASIC = path.join(MAPS, 'basic');

function tmpCopy(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-maps-'));
  fs.cpSync(path.join(MAPS, name), dir, { recursive: true });
  return dir;
}

test('project-maps: sc-map has sorted nodes and intra-feature edges only, tasksHash bound to hasher', () => {
  const { scMap } = computeProjections(BASIC);
  assert.equal(scMap.schema, 1);
  assert.deepEqual(scMap.nodes, ['T-001', 'T-002', 'T-003']);
  assert.deepEqual(scMap.edges, [
    { from: 'T-002', to: 'T-001', contract: 'T-001::API-2@v1' },
    { from: 'T-003', to: 'T-002', contract: 'T-002::DB-3@v1' },
  ]);
  // billing#API-9@v1 is a cross-feature ref (manifest upstream block), never an SC edge.
  assert.ok(!scMap.edges.some((e) => e.contract.includes('#')));
  assert.equal(scMap.generatedFrom.tasksHash, runHasher(BASIC).tasksHash);
});

test('project-maps: ac-map parses covers lines — multiple ACs, empty covers, whitespace tolerance', () => {
  const { acMap } = computeProjections(BASIC);
  assert.equal(acMap.schema, 1);
  assert.deepEqual(acMap.acs, {
    'AC-5': { covers: ['FR-2', 'NFR-1'] }, // spec line: "covers:   FR-2 , NFR-1"
    'AC-6': { covers: [] }, // no covers line
  });
  assert.equal(acMap.generatedFrom.specHash, runHasher(BASIC).specHash);
});

test('project-maps: write is schema-valid, byte-canonical, idempotent, and reports counts', () => {
  const dir = tmpCopy('basic');
  try {
    const { scMap, acMap } = computeProjections(dir);
    const res = runProjectMaps(dir);
    assert.deepEqual(res, { ok: true, written: true, scMap: { nodes: 3, edges: 2 }, acMap: { acs: 2 } });

    const scStr = fs.readFileSync(path.join(dir, 'sc-map.json'), 'utf8');
    const acStr = fs.readFileSync(path.join(dir, 'ac-map.json'), 'utf8');
    assert.equal(scStr, serializeJson(scMap));
    assert.equal(acStr, serializeJson(acMap));
    assert.ok(scStr.endsWith('}\n')); // trailing newline
    assert.ok(scStr.includes('\n  "schema": 1')); // 2-space indent

    runProjectMaps(dir); // rerun byte-identical
    assert.equal(fs.readFileSync(path.join(dir, 'sc-map.json'), 'utf8'), scStr);
    assert.equal(fs.readFileSync(path.join(dir, 'ac-map.json'), 'utf8'), acStr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('project-maps: --check reports missing, then fresh, then stale after a consumes edit', () => {
  const dir = tmpCopy('basic');
  try {
    assert.deepEqual(runProjectMaps(dir, { check: true }).check, { scMap: 'missing', acMap: 'missing' });

    runProjectMaps(dir);
    assert.deepEqual(runProjectMaps(dir, { check: true }).check, { scMap: 'fresh', acMap: 'fresh' });

    // Editing a task's consumes changes the SC projection; the spec is untouched so ac-map stays fresh.
    const t2 = path.join(dir, 'tasks', 'T-002.md');
    fs.writeFileSync(t2, fs.readFileSync(t2, 'utf8').replace('T-001::API-2@v1', 'T-001::API-2@v2'));
    assert.deepEqual(runProjectMaps(dir, { check: true }).check, { scMap: 'stale', acMap: 'fresh' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('project-maps: --check flags ac-map stale after a spec covers edit', () => {
  const dir = tmpCopy('basic');
  try {
    runProjectMaps(dir);
    const spec = path.join(dir, 'spec.md');
    fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('covers:   FR-2 , NFR-1', 'covers: FR-2'));
    assert.equal(runProjectMaps(dir, { check: true }).check.acMap, 'stale');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('project-maps: a cyclic SC graph returns a concrete cycle path and writes nothing', () => {
  const dir = tmpCopy('cycle');
  try {
    const res = runProjectMaps(dir);
    assert.equal(res.ok, false);
    assert.deepEqual(res.cycle, ['T-001', 'T-002', 'T-001']);
    assert.ok(!fs.existsSync(path.join(dir, 'sc-map.json')));
    assert.ok(!fs.existsSync(path.join(dir, 'ac-map.json')));
    assert.deepEqual(computeProjections(dir).cycle, ['T-001', 'T-002', 'T-001']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('project-maps: zero-task feature writes maps with null tasksHash (documented degenerate)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-maps-'));
  fs.writeFileSync(path.join(dir, 'spec.md'), '#### DB-1 — Table\n\nBody.\n');
  fs.writeFileSync(
    path.join(dir, 'feature.lock.json'),
    serializeJson({ schema: 1, spec: { hash: null, history: [] }, idCounters: { DB: 1 }, elements: {}, tasks: {} }),
  );
  const result = runProjectMaps(dir);
  assert.equal(result.written, true);
  const scMap = JSON.parse(fs.readFileSync(path.join(dir, 'sc-map.json'), 'utf8'));
  assert.equal(scMap.generatedFrom.tasksHash, null);
  assert.deepEqual(scMap.nodes, []);
  assert.deepEqual(scMap.edges, []);
});

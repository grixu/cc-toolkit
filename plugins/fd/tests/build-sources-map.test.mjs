import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBuildSourcesMap, mergeRecords, BuildSourcesMapError } from '../scripts/build-sources-map.mjs';
import { readJson, serializeJson } from '../scripts/lib/json-io.mjs';

function setup() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fd-sources-map-'));
}

function record(overrides = {}) {
  return {
    claim: 'Cerbos reloads policies on a timer',
    fact: 'cacheDuration controls the policy refresh interval',
    quote: 'the store re-reads policies every cacheDuration',
    source: { type: 'web', ref: 'sources/web/cerbos-policies.md', url: 'https://docs.cerbos.dev/x' },
    anchors: ['FR-3', 'NFR-1'],
    groundedAt: '2026-07-07T16:00:00.000Z',
    ...overrides,
  };
}

function writeRecords(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, serializeJson(value));
  return file;
}

const mapOf = (dir) => readJson(path.join(dir, 'sources-map.json'));

test('seed writes an empty valid map and is an idempotent no-op', () => {
  const dir = setup();
  try {
    const res = runBuildSourcesMap(dir, { seed: true });
    assert.deepEqual(mapOf(dir), { schema: 1, records: [] });
    assert.equal(res.total, 0);
    const before = fs.readFileSync(path.join(dir, 'sources-map.json'), 'utf8');
    runBuildSourcesMap(dir, { seed: true });
    assert.equal(fs.readFileSync(path.join(dir, 'sources-map.json'), 'utf8'), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('merges record files, dedupes by claim+source, stays byte-canonical on rerun', () => {
  const dir = setup();
  try {
    const f1 = writeRecords(dir, 'r1.json', [record(), record({ claim: 'other claim' })]);
    const first = runBuildSourcesMap(dir, { recordFiles: [f1] });
    assert.equal(first.added, 2);
    assert.equal(first.total, 2);

    // Same claim, different source → a new record; identical record → duplicate skipped.
    const f2 = writeRecords(dir, 'r2.json', {
      records: [record(), record({ source: { type: 'file', ref: 'sources/prd.md' } })],
    });
    const second = runBuildSourcesMap(dir, { recordFiles: [f2] });
    assert.equal(second.added, 1);
    assert.equal(second.duplicatesSkipped, 1);
    assert.equal(second.total, 3);
    assert.equal(mapOf(dir).records.length, 3);

    const before = fs.readFileSync(path.join(dir, 'sources-map.json'), 'utf8');
    const rerun = runBuildSourcesMap(dir, { recordFiles: [f2] });
    assert.equal(rerun.added, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'sources-map.json'), 'utf8'), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses invalid records before writing anything', () => {
  const dir = setup();
  try {
    const good = writeRecords(dir, 'good.json', [record()]);
    runBuildSourcesMap(dir, { recordFiles: [good] });
    const before = fs.readFileSync(path.join(dir, 'sources-map.json'), 'utf8');

    const bad = writeRecords(dir, 'bad.json', [record({ claim: 'ungrounded claim', groundedAt: undefined })]);
    assert.throws(() => runBuildSourcesMap(dir, { recordFiles: [bad] }), /groundedAt/);
    assert.equal(fs.readFileSync(path.join(dir, 'sources-map.json'), 'utf8'), before);

    const badAnchor = writeRecords(dir, 'bad-anchor.json', [record({ claim: 'x', anchors: ['task-1'] })]);
    assert.throws(() => runBuildSourcesMap(dir, { recordFiles: [badAnchor] }));
    assert.equal(fs.readFileSync(path.join(dir, 'sources-map.json'), 'utf8'), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects missing/empty/non-array record files and a no-op invocation', () => {
  const dir = setup();
  try {
    assert.throws(() => runBuildSourcesMap(dir, {}), BuildSourcesMapError);
    assert.throws(
      () => runBuildSourcesMap(dir, { recordFiles: [path.join(dir, 'absent.json')] }),
      /missing or empty/,
    );
    const notArray = writeRecords(dir, 'not-array.json', { schema: 1 });
    assert.throws(() => runBuildSourcesMap(dir, { recordFiles: [notArray] }), /must be a JSON array/);
    assert.equal(fs.existsSync(path.join(dir, 'sources-map.json')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeRecords keeps prior order and appends new records in input order', () => {
  const a = record({ claim: 'a' });
  const b = record({ claim: 'b' });
  const c = record({ claim: 'c' });
  const { records, added, duplicates } = mergeRecords([a, b], [b, c, a]);
  assert.deepEqual(records.map((r) => r.claim), ['a', 'b', 'c']);
  assert.equal(added, 1);
  assert.equal(duplicates, 2);
});

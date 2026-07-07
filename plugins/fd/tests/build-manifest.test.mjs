import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runBuildManifest, bumpCounters, deriveProducers, BuildManifestError,
} from '../scripts/build-manifest.mjs';
import { runHasher } from '../scripts/hasher.mjs';
import { readJson } from '../scripts/lib/json-io.mjs';

const FX = path.join(import.meta.dirname, 'fixtures');
const AT = '2026-01-01T00:00:00.000Z';

function tmpCopy(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-build-manifest-'));
  fs.cpSync(src, dir, { recursive: true });
  return dir;
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fd-build-manifest-'));
}

const lockPath = (dir) => path.join(dir, 'feature.lock.json');

test('--seed writes a minimal valid manifest and is an idempotent no-op afterwards', () => {
  const dir = tmpDir();
  try {
    const first = runBuildManifest(dir, { seed: true });
    assert.equal(first.written, true);
    const manifest = readJson(lockPath(dir));
    assert.equal(manifest.spec.hash, null);
    assert.deepEqual(manifest.spec.history, []);
    assert.deepEqual(manifest.elements, {});
    assert.deepEqual(manifest.tasks, {});
    assert.equal(manifest.idCounters.T, 0);
    assert.equal(manifest.idCounters.INFRASTRUCTURE, 0);
    const second = runBuildManifest(dir, { seed: true });
    assert.equal(second.written, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('first projection: elements, producers, tasks, counters, history', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    const res = runBuildManifest(dir, { historySummary: 'init', at: AT });
    assert.equal(res.written, true);
    assert.deepEqual(res.producers, { 'API-2': 'T-001', 'DB-3': 'T-002', 'MODULE-1': 'T-003' });
    assert.deepEqual(res.diff.removed, []);
    assert.equal(res.diff.added.length, 7);

    const manifest = readJson(lockPath(dir));
    const fresh = runHasher(dir);
    assert.equal(manifest.spec.hash, fresh.specHash);
    assert.deepEqual(manifest.spec.history, [{ hash: fresh.specHash, at: AT, summary: 'init' }]);
    assert.deepEqual(manifest.elements['DB-3'],
      { hash: fresh.elements['DB-3'], version: 1, status: 'pending', producer: 'T-002' });
    assert.equal(manifest.elements['AC-5'].producer, undefined);
    assert.deepEqual(manifest.tasks['T-001'], {
      identityKey: ['API-2'],
      produces: ['API-2'],
      consumes: [],
      covers: ['FR-2'],
      inputHash: fresh.tasks['T-001'].inputHash,
      contentHash: fresh.tasks['T-001'].contentHash,
      specHash: fresh.specHash,
      status: 'planned',
    });
    // counters were already at their high-water marks — nothing moves.
    assert.deepEqual(manifest.idCounters, { DB: 3, API: 2, MODULE: 1, AC: 6, FR: 2, NFR: 1, T: 3 });
    // prior extras carried verbatim.
    assert.equal(manifest.upstream[0].slug, 'billing');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('re-run is byte-identical and never duplicates the history entry', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    runBuildManifest(dir, { historySummary: 'init', at: AT });
    const once = fs.readFileSync(lockPath(dir), 'utf8');
    runBuildManifest(dir, { historySummary: 'init', at: '2027-01-01T00:00:00.000Z' });
    const twice = fs.readFileSync(lockPath(dir), 'utf8');
    assert.equal(twice, once);
    assert.ok(once.endsWith('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('append-only counters: deleting the highest-numbered element does not shrink its counter', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    runBuildManifest(dir, { historySummary: 'init', at: AT });
    const specPath = path.join(dir, 'spec.md');
    const spec = fs.readFileSync(specPath, 'utf8');
    fs.writeFileSync(specPath, spec.slice(0, spec.indexOf('### AC-6')));
    const res = runBuildManifest(dir, { at: AT });
    assert.deepEqual(res.diff.removed, ['AC-6']);
    const manifest = readJson(lockPath(dir));
    assert.equal(manifest.elements['AC-6'], undefined);
    assert.equal(manifest.idCounters.AC, 6);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bumpCounters keeps prior floors and prior keys', () => {
  const out = bumpCounters({ DB: 5, ZZZ: 2, T: 7 }, ['DB-2'], ['T-1']);
  assert.deepEqual(out, { DB: 5, ZZZ: 2, T: 7 });
  const grown = bumpCounters({ DB: 1, T: 0 }, ['DB-4'], ['T-9']);
  assert.deepEqual(grown, { DB: 4, T: 9 });
});

test('deriveProducers throws when two tasks produce the same element', () => {
  assert.throws(
    () => deriveProducers([
      { id: 'T-001', produces: ['API-2'] },
      { id: 'T-002', produces: ['API-2'] },
    ]),
    BuildManifestError,
  );
});

test('delivered element: hash drift flips to drifted, matching hash stays delivered, spec removal retains the record', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    runBuildManifest(dir, { historySummary: 'init', at: AT });
    const manifest = readJson(lockPath(dir));
    manifest.elements['API-2'].status = 'delivered';
    manifest.elements['API-2'].deliveredHash = manifest.elements['API-2'].hash;
    manifest.elements['DB-3'].status = 'delivered';
    manifest.elements['DB-3'].deliveredHash = manifest.elements['DB-3'].hash;
    fs.writeFileSync(lockPath(dir), JSON.stringify(manifest, null, 2) + '\n');

    const specPath = path.join(dir, 'spec.md');
    let spec = fs.readFileSync(specPath, 'utf8');
    spec = spec.replace('POST /users with an idempotency key.', 'POST /users v2.');
    spec = spec.replace(/## Data[\s\S]*?## API/, '## API');
    fs.writeFileSync(specPath, spec);

    const res = runBuildManifest(dir, { at: AT });
    const next = readJson(lockPath(dir));
    assert.equal(next.elements['API-2'].status, 'drifted');
    assert.equal(next.elements['API-2'].deliveredHash, manifest.elements['API-2'].deliveredHash);
    assert.equal(next.elements['API-2'].version, 1);
    // DB-3 vanished from the spec but its delivery record is retained.
    assert.deepEqual(next.elements['DB-3'], manifest.elements['DB-3']);
    assert.ok(res.warnings.some((w) => w.element === 'DB-3' && w.reason === 'delivered-element-missing-from-spec'));
    assert.equal(next.idCounters.DB, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('status carry: implemented never downgrades; finalizeReady promotes only planned/stale', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    runBuildManifest(dir, { historySummary: 'init', at: AT });
    const manifest = readJson(lockPath(dir));
    manifest.tasks['T-001'].status = 'implemented';
    manifest.tasks['T-001'].impl = { commits: ['0123456789abcdef'] };
    fs.writeFileSync(lockPath(dir), JSON.stringify(manifest, null, 2) + '\n');

    runBuildManifest(dir, { at: AT, refreshTaskHashes: true, finalizeReady: true });
    const next = readJson(lockPath(dir));
    assert.equal(next.tasks['T-001'].status, 'implemented');
    assert.deepEqual(next.tasks['T-001'].impl, { commits: ['0123456789abcdef'] });
    assert.equal(next.tasks['T-002'].status, 'ready');
    assert.equal(next.tasks['T-003'].status, 'ready');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a manifest task whose file vanished is retained verbatim with a warning', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    runBuildManifest(dir, { historySummary: 'init', at: AT });
    const before = readJson(lockPath(dir)).tasks['T-003'];
    fs.rmSync(path.join(dir, 'tasks', 'T-003.md'));
    const res = runBuildManifest(dir, { at: AT });
    assert.ok(res.warnings.some((w) => w.task === 'T-003' && w.reason === 'file-missing'));
    const next = readJson(lockPath(dir));
    assert.deepEqual(next.tasks['T-003'], before);
    assert.equal(next.idCounters.T, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses to project while the spec carries unknown KINDs; --add-kind unblocks', () => {
  const dir = tmpCopy(path.join(FX, 'hasher', 'basic'));
  try {
    assert.throws(() => runBuildManifest(dir, { at: AT }), /unknown KINDs in spec: ZZZ/);
    const added = runBuildManifest(dir, { addKind: 'ZZZ' });
    assert.equal(added.counters.ZZZ, 0);
    const res = runBuildManifest(dir, { at: AT });
    assert.equal(res.counters.ZZZ, 1);
    const manifest = readJson(lockPath(dir));
    assert.equal(manifest.elements['ZZZ-1'].status, 'pending');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--add-kind validates the KIND and requires an existing manifest', () => {
  const dir = tmpDir();
  try {
    assert.throws(() => runBuildManifest(dir, { addKind: 'DB' }), /seed it first/);
    runBuildManifest(dir, { seed: true });
    assert.throws(() => runBuildManifest(dir, { addKind: 'db' }), /invalid KIND/);
    assert.throws(() => runBuildManifest(dir, { addKind: 'ABCDEFGHIJKLMNOPQ' }), /invalid KIND/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stored task hashes are the staleness baseline: preserved by default, moved only with --refresh-task-hashes', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    runBuildManifest(dir, { historySummary: 'init', at: AT });
    const stored = readJson(lockPath(dir)).tasks['T-001'].contentHash;
    fs.appendFileSync(path.join(dir, 'tasks', 'T-001.md'), '\nHand edit.\n');
    const fresh = runHasher(dir).tasks['T-001'].contentHash;
    assert.notEqual(fresh, stored);

    runBuildManifest(dir, { at: AT });
    assert.equal(readJson(lockPath(dir)).tasks['T-001'].contentHash, stored);

    runBuildManifest(dir, { at: AT, refreshTaskHashes: true });
    assert.equal(readJson(lockPath(dir)).tasks['T-001'].contentHash, fresh);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('malformed anchors surface as warnings without blocking the projection', () => {
  const dir = tmpCopy(path.join(FX, 'maps', 'basic'));
  try {
    fs.appendFileSync(path.join(dir, 'spec.md'), '\n#### DB-99 - wrong dash\n\nBody.\n');
    const res = runBuildManifest(dir, { historySummary: 'init', at: AT });
    assert.equal(res.written, true);
    assert.ok(res.warnings.some((w) => w.reason === 'malformed-anchor' && /DB-99/.test(w.text)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

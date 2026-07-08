import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordTask, recordShip, recordPhase, recordClose, recordBranch, RecordImplError } from '../scripts/record-impl.mjs';
import { runBuildManifest } from '../scripts/build-manifest.mjs';
import { applySeedState } from '../scripts/apply.mjs';
import { readJson } from '../scripts/lib/json-io.mjs';

const FX = path.join(import.meta.dirname, 'fixtures');
const HASH_A = 'sha256:' + 'a'.repeat(64);

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-record-impl-'));
  fs.cpSync(path.join(FX, 'maps', 'basic'), dir, { recursive: true });
  runBuildManifest(dir, { historySummary: 'init', at: '2026-01-01T00:00:00.000Z' });
  applySeedState(dir, { slug: 'basic', title: 'Basic feature', language: 'en', createdFrom: 'topic' });
  return dir;
}

const manifest = (dir) => readJson(path.join(dir, 'feature.lock.json'));
const state = (dir) => readJson(path.join(dir, 'state.json'));

test('phase sets implementing + waveInProgress and rejects out-of-scope phases', () => {
  const dir = setup();
  try {
    const res = recordPhase(dir, { phase: 'implementing', waveInProgress: true });
    assert.deepEqual(res, { phase: 'implementing', waveInProgress: true });
    assert.equal(state(dir).phase, 'implementing');
    recordPhase(dir, { waveInProgress: false });
    assert.equal(state(dir).waveInProgress, false);
    assert.equal(state(dir).phase, 'implementing');
    assert.throws(() => recordPhase(dir, { phase: 'tasks' }), /only sets "implementing" or "shipped"/);
    assert.throws(() => recordPhase(dir, {}), RecordImplError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('record sets commits + status, appends without duplicates, bulk-sets the wave gate', () => {
  const dir = setup();
  try {
    recordTask(dir, { tasks: ['T-001'], commits: ['c0ffee01'], status: 'implemented' });
    let t = manifest(dir).tasks['T-001'];
    assert.deepEqual(t.impl, { commits: ['c0ffee01'] });
    assert.equal(t.status, 'implemented');

    recordTask(dir, { tasks: ['T-001'], commits: ['c0ffee01', 'c0ffee02'], append: true });
    t = manifest(dir).tasks['T-001'];
    assert.deepEqual(t.impl.commits, ['c0ffee01', 'c0ffee02']);

    recordTask(dir, { tasks: ['T-001', 'T-002'], gate: 'pass' });
    const m = manifest(dir);
    assert.equal(m.tasks['T-001'].impl.gate, 'pass');
    assert.equal(m.tasks['T-002'].impl.gate, 'pass');
    assert.deepEqual(m.tasks['T-002'].impl.commits, []);

    assert.throws(() => recordTask(dir, { tasks: ['T-001', 'T-002'], commits: ['x'] }), /single --task/);
    assert.throws(() => recordTask(dir, { tasks: ['T-099'], commits: ['x'] }), /unknown task/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('close records feature-level verdicts incrementally and validates values', () => {
  const dir = setup();
  try {
    let res = recordClose(dir, { fullCi: 'pass' });
    assert.deepEqual(res, { close: { fullCi: 'pass' } });
    assert.deepEqual(state(dir).close, { fullCi: 'pass' });

    res = recordClose(dir, { cr: 'pass', finalCi: 'pass' });
    assert.deepEqual(state(dir).close, { fullCi: 'pass', cr: 'pass', finalCi: 'pass' });

    recordClose(dir, { fullCi: 'fail' });
    assert.equal(state(dir).close.fullCi, 'fail');
    assert.equal(state(dir).close.finalCi, 'pass');

    assert.throws(() => recordClose(dir, {}), /at least one of/);
    assert.throws(() => recordClose(dir, { fullCi: 'green' }), /must be "pass" or "fail"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('branch sets state.branch and rejects an empty name', () => {
  const dir = setup();
  try {
    const res = recordBranch(dir, { set: 'feat/basic' });
    assert.deepEqual(res, { branch: 'feat/basic' });
    assert.equal(state(dir).branch, 'feat/basic');
    assert.throws(() => recordBranch(dir, {}), /--set/);
    assert.throws(() => recordBranch(dir, { set: '' }), /--set/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ship flips tasks + delivers elements; phase flips to shipped only when every live task shipped', () => {
  const dir = setup();
  try {
    const partial = recordShip(dir, { tasks: ['T-001'], deliver: { 'API-2': HASH_A } });
    assert.equal(partial.phase, null);
    let m = manifest(dir);
    assert.equal(m.tasks['T-001'].status, 'shipped');
    assert.deepEqual(m.elements['API-2'].deliveredHash, HASH_A);
    assert.equal(m.elements['API-2'].hash, HASH_A);
    assert.equal(m.elements['API-2'].status, 'delivered');
    assert.equal(state(dir).phase, 'spec');

    const full = recordShip(dir, { tasks: ['T-002', 'T-003'] });
    assert.equal(full.phase, 'shipped');
    assert.equal(state(dir).phase, 'shipped');

    assert.throws(() => recordShip(dir, { tasks: ['T-001'], deliver: { 'ZZ-9': HASH_A } }), /unknown element/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a dropped task does not block the shipped phase flip', () => {
  const dir = setup();
  try {
    const m = manifest(dir);
    m.tasks['T-003'].status = 'dropped';
    fs.writeFileSync(path.join(dir, 'feature.lock.json'), JSON.stringify(m, null, 2) + '\n');
    const res = recordShip(dir, { tasks: ['T-001', 'T-002'] });
    assert.equal(res.phase, 'shipped');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

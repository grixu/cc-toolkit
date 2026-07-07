import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyFill, applyFinalize, applyReadinessSpec, applyReconcile, applySeedState, ApplyError,
} from '../scripts/apply.mjs';
import { runBuildManifest } from '../scripts/build-manifest.mjs';
import { runHasher, parseTaskFrontmatter } from '../scripts/hasher.mjs';
import { readJson } from '../scripts/lib/json-io.mjs';

const FX = path.join(import.meta.dirname, 'fixtures');
const AT = '2026-01-01T00:00:00.000Z';

function tmpCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-apply-'));
  fs.cpSync(path.join(FX, 'maps', 'basic'), dir, { recursive: true });
  return dir;
}

function seed(dir) {
  applySeedState(dir, { slug: 'basic', title: 'Basic feature', language: 'en', createdFrom: 'topic' });
}

function writeVerdict(dir, verdict) {
  const file = path.join(dir, 'verdict.json');
  fs.writeFileSync(file, JSON.stringify({
    verdict, dimensionsRun: ['frontmatter', 'coverage'], failedChecks: [], waivedChecks: [],
  }));
  return file;
}

const taskFm = (dir, id) =>
  parseTaskFrontmatter(fs.readFileSync(path.join(dir, 'tasks', `${id}.md`), 'utf8')).frontmatter;

test('seed-state writes a valid state.json once and validates required inputs', () => {
  const dir = tmpCopy();
  try {
    assert.throws(
      () => applySeedState(dir, { slug: 'x', title: 'y', language: 'pl' }),
      /--created-from/,
    );
    seed(dir);
    const state = readJson(path.join(dir, 'state.json'));
    assert.equal(state.phase, 'spec');
    assert.equal(state.branch, null);
    assert.equal(state.waveInProgress, false);
    const again = applySeedState(dir, { slug: 'z', title: 'z', language: 'en', createdFrom: 'docs' });
    assert.equal(again.written, false);
    assert.equal(readJson(path.join(dir, 'state.json')).slug, 'basic');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fill replaces placeholder builtAgainst with real hashes and leaves tasksHash unchanged', () => {
  const dir = tmpCopy();
  try {
    const before = runHasher(dir);
    const res = applyFill(dir);
    assert.deepEqual(res.filled, ['T-001', 'T-002', 'T-003']);
    const after = runHasher(dir);
    assert.equal(after.tasksHash, before.tasksHash);
    const fm = taskFm(dir, 'T-002');
    assert.deepEqual(fm.builtAgainst, {
      specHash: before.specHash,
      inputHash: before.tasks['T-002'].inputHash,
    });
    assert.equal(fm.status, 'planned');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('finalize (ready): flips to ready, reprojects the manifest, records readiness from the fresh rollup', () => {
  const dir = tmpCopy();
  try {
    seed(dir);
    applyFill(dir);
    const res = applyFinalize(dir, { verdictFile: writeVerdict(dir, 'ready') });
    assert.deepEqual(res.readyTasks, ['T-001', 'T-002', 'T-003']);
    assert.equal(res.phase, 'tasks');

    assert.equal(taskFm(dir, 'T-001').status, 'ready');
    const manifest = readJson(path.join(dir, 'feature.lock.json'));
    assert.equal(manifest.tasks['T-003'].status, 'ready');

    const fresh = runHasher(dir);
    assert.equal(res.tasksHash, fresh.tasksHash);
    assert.equal(manifest.tasks['T-001'].contentHash, fresh.tasks['T-001'].contentHash);

    const state = readJson(path.join(dir, 'state.json'));
    assert.equal(state.phase, 'tasks');
    assert.equal(state.tasksHash, fresh.tasksHash);
    assert.equal(state.readiness.tasks.verdict, 'ready');
    assert.equal(state.readiness.tasks.validatedHash, fresh.tasksHash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('finalize (blocked): records the verdict, flips nothing, phase stays', () => {
  const dir = tmpCopy();
  try {
    seed(dir);
    applyFill(dir);
    const res = applyFinalize(dir, { verdictFile: writeVerdict(dir, 'blocked') });
    assert.deepEqual(res.readyTasks, []);
    assert.equal(taskFm(dir, 'T-001').status, 'planned');
    const state = readJson(path.join(dir, 'state.json'));
    assert.equal(state.phase, 'spec');
    assert.equal(state.readiness.tasks.verdict, 'blocked');
    assert.equal(state.readiness.tasks.validatedHash, runHasher(dir).tasksHash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readiness-spec records the verdict with the fresh specHash and sets state.specHash', () => {
  const dir = tmpCopy();
  try {
    seed(dir);
    const res = applyReadinessSpec(dir, { verdictFile: writeVerdict(dir, 'ready') });
    const fresh = runHasher(dir);
    assert.equal(res.specHash, fresh.specHash);
    const state = readJson(path.join(dir, 'state.json'));
    assert.equal(state.specHash, fresh.specHash);
    assert.equal(state.readiness.spec.validatedHash, fresh.specHash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reconcile executes a HIL-approved plan: drop, stale, @v bump', () => {
  const dir = tmpCopy();
  try {
    runBuildManifest(dir, { historySummary: 'init', at: AT });
    const plan = path.join(dir, 'plan.json');
    fs.writeFileSync(plan, JSON.stringify({ drop: ['T-003'], stale: ['T-002'], bumpVersions: ['API-2'] }));
    const res = applyReconcile(dir, { planFile: plan });
    assert.deepEqual(res, { dropped: ['T-003'], staled: ['T-002'], bumped: ['API-2@v2'] });
    assert.equal(fs.existsSync(path.join(dir, 'tasks', 'T-003.md')), false);
    const manifest = readJson(path.join(dir, 'feature.lock.json'));
    assert.equal(manifest.tasks['T-003'].status, 'dropped');
    assert.equal(manifest.tasks['T-002'].status, 'stale');
    assert.equal(manifest.elements['API-2'].version, 2);
    // a later projection neither resurrects the dropped task nor warns about its file
    const again = runBuildManifest(dir, { at: AT });
    assert.equal(readJson(path.join(dir, 'feature.lock.json')).tasks['T-003'].status, 'dropped');
    assert.ok(!again.warnings.some((w) => w.task === 'T-003'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reconcile refuses unknown ids; verdict files are shape-checked', () => {
  const dir = tmpCopy();
  try {
    runBuildManifest(dir, { at: AT });
    const plan = path.join(dir, 'plan.json');
    fs.writeFileSync(plan, JSON.stringify({ drop: ['T-099'] }));
    assert.throws(() => applyReconcile(dir, { planFile: plan }), /unknown task T-099/);

    seed(dir);
    const bad = path.join(dir, 'verdict.json');
    fs.writeFileSync(bad, JSON.stringify({ verdict: 'ready', dimensionsRun: [] }));
    assert.throws(() => applyReadinessSpec(dir, { verdictFile: bad }), /missing "failedChecks"/);
    fs.writeFileSync(bad, JSON.stringify({ verdict: 'maybe', dimensionsRun: [], failedChecks: [], waivedChecks: [] }));
    assert.throws(() => applyReadinessSpec(dir, { verdictFile: bad }), ApplyError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrate, MigrateError } from '../scripts/migrate.mjs';

const CHAINS = path.join(import.meta.dirname, 'fixtures', 'migrations');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fd-mig-'));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('migrate: a single-step chain migrates the file and backs up the original', async () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'state.json');
    writeJson(file, { schema: 1, slug: 'x', foo: 'bar' });
    const report = await runMigrate(file, { migrationsDir: path.join(CHAINS, 'chain-1-to-2') });

    assert.deepEqual(report.current, []);
    assert.deepEqual(report.blocked, []);
    assert.deepEqual(report.migrated, [{ file, from: 1, to: 2, backup: `${file}.bak-schema1` }]);
    assert.deepEqual(readJson(file), { schema: 2, slug: 'x', foo: 'bar', addedInV2: true });
    assert.deepEqual(readJson(`${file}.bak-schema1`), { schema: 1, slug: 'x', foo: 'bar' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: a two-step chain applies 1→2→3 in order with a single original backup', async () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'state.json');
    writeJson(file, { schema: 1, slug: 'y' });
    const report = await runMigrate(file, { migrationsDir: path.join(CHAINS, 'chain-1-to-3') });

    assert.deepEqual(report.migrated, [{ file, from: 1, to: 3, backup: `${file}.bak-schema1` }]);
    assert.deepEqual(readJson(file), { schema: 3, slug: 'y', addedInV2: true, addedInV3: true });
    assert.equal(readJson(`${file}.bak-schema1`).schema, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: an artifact newer than the plugin is blocked and left untouched', async () => {
  const dir = tmpDir();
  const emptyMig = tmpDir();
  try {
    const file = path.join(dir, 'state.json');
    writeJson(file, { schema: 5, slug: 'z' });
    const report = await runMigrate(file, { migrationsDir: emptyMig });

    assert.deepEqual(report.migrated, []);
    assert.deepEqual(report.current, []);
    assert.deepEqual(report.blocked, [{
      error: 'workspace-newer',
      file,
      schema: 5,
      supported: 1,
      message: 'workspace requires a newer fd plugin — update the fd plugin',
    }]);
    assert.equal(readJson(file).schema, 5);
    assert.ok(!fs.existsSync(`${file}.bak-schema5`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(emptyMig, { recursive: true, force: true });
  }
});

test('migrate: a missing chain step aborts with a named gap and writes nothing', async () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'state.json');
    writeJson(file, { schema: 1, slug: 'm' });
    await assert.rejects(
      () => runMigrate(file, { migrationsDir: path.join(CHAINS, 'chain-missing') }),
      (err) => {
        assert.ok(err instanceof MigrateError);
        assert.equal(err.payload.error, 'missing-migration-step');
        assert.equal(err.payload.module, 'state-1-to-2.mjs');
        return true;
      },
    );
    assert.equal(readJson(file).schema, 1);
    assert.ok(!fs.existsSync(`${file}.bak-schema1`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: --dry-run reports the plan but touches nothing on disk', async () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'state.json');
    writeJson(file, { schema: 1, slug: 'd' });
    const report = await runMigrate(file, { dryRun: true, migrationsDir: path.join(CHAINS, 'chain-1-to-2') });

    assert.deepEqual(report.migrated, [{ file, from: 1, to: 2, backup: `${file}.bak-schema1` }]);
    assert.deepEqual(readJson(file), { schema: 1, slug: 'd' });
    assert.ok(!fs.existsSync(`${file}.bak-schema1`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: featureDir mode migrates each known artifact and leaves up-to-date ones current', async () => {
  const dir = tmpDir();
  try {
    writeJson(path.join(dir, 'state.json'), { schema: 1, slug: 'a' });
    writeJson(path.join(dir, 'sc-map.json'), { schema: 1, nodes: [] });
    writeJson(path.join(dir, 'feature.lock.json'), { schema: 1, idCounters: {} });
    const report = await runMigrate(dir, { migrationsDir: path.join(CHAINS, 'chain-multi') });

    assert.deepEqual(report.migrated.map((m) => path.basename(m.file)).sort(), ['sc-map.json', 'state.json']);
    assert.deepEqual(report.current.map((f) => path.basename(f)), ['feature.lock.json']);
    assert.deepEqual(report.blocked, []);
    assert.equal(readJson(path.join(dir, 'state.json')).schema, 2);
    assert.equal(readJson(path.join(dir, 'sc-map.json')).schema, 2);
    assert.equal(readJson(path.join(dir, 'feature.lock.json')).schema, 1);
    assert.ok(fs.existsSync(path.join(dir, 'state.json.bak-schema1')));
    assert.ok(fs.existsSync(path.join(dir, 'sc-map.json.bak-schema1')));
    assert.ok(!fs.existsSync(path.join(dir, 'feature.lock.json.bak-schema1')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: an artifact already at the current version is left untouched', async () => {
  const dir = tmpDir();
  const emptyMig = tmpDir();
  try {
    const file = path.join(dir, 'state.json');
    writeJson(file, { schema: 1, slug: 'c' });
    const report = await runMigrate(file, { migrationsDir: emptyMig });
    assert.deepEqual(report, { migrated: [], current: [file], blocked: [] });
    assert.equal(readJson(file).schema, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(emptyMig, { recursive: true, force: true });
  }
});

test('migrate: a non-artifact filename is rejected', async () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'random.json');
    writeJson(file, { schema: 1 });
    await assert.rejects(
      () => runMigrate(file),
      (err) => err instanceof MigrateError && err.payload.error === 'unknown-artifact',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

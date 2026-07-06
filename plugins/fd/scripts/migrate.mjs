#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertValid } from './lib/validate.mjs';

// Forward-only schema migration for fd workspace artifacts.
// Each artifact carries an integer `schema`. A workspace older than the plugin is
// migrated up a chain of single-version step modules; a workspace newer than the plugin
// is a hard block. HIL confirmation is the calling command's job — this script never
// prompts (it runs --dry-run first for the command, then for real).

const SCHEMA_DIR = path.join(import.meta.dirname, '..', 'schemas');
const DEFAULT_MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

// Baseline version every artifact family starts at. The effective target for an artifact
// is the highest `to` its available step modules reach, or this baseline when none exist.
const BASE_SCHEMA = 1;

const WORKSPACE_NEWER_MESSAGE = 'workspace requires a newer fd plugin — update the fd plugin';

// Artifact filename → artifact name (also the schema-file and step-module prefix).
const ARTIFACT_FILES = {
  'feature.lock.json': 'feature-lock',
  'state.json': 'state',
  'sc-map.json': 'sc-map',
  'ac-map.json': 'ac-map',
  'sources-map.json': 'sources-map',
};

const STEP_NAME_RE = /^(.+)-([0-9]+)-to-([0-9]+)\.mjs$/;

// Carries a structured payload so both the CLI (stdout JSON) and tests see the same shape.
export class MigrateError extends Error {
  constructor(payload) {
    super(payload.message || payload.error);
    this.payload = payload;
  }
}

function serializeJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

// Discover step modules: { artifact -> Map(from -> { from, to, name, mod }) }.
async function scanMigrations(dir) {
  const byArtifact = new Map();
  if (!fs.existsSync(dir)) return byArtifact;
  for (const name of fs.readdirSync(dir).sort()) {
    const m = STEP_NAME_RE.exec(name);
    if (!m) continue;
    const artifact = m[1];
    const from = Number(m[2]);
    const to = Number(m[3]);
    const mod = await import(path.join(dir, name));
    if (!byArtifact.has(artifact)) byArtifact.set(artifact, new Map());
    byArtifact.get(artifact).set(from, { from, to, name, mod });
  }
  return byArtifact;
}

function targetVersion(artifact, byArtifact) {
  const steps = byArtifact.get(artifact);
  let maxTo = BASE_SCHEMA;
  if (steps) for (const s of steps.values()) if (s.to > maxTo) maxTo = s.to;
  return maxTo;
}

function resolveArtifactFiles(target) {
  const abs = path.resolve(target);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw new MigrateError({ error: 'not-found', file: abs, message: `path not found: ${abs}` });
  }
  if (stat.isDirectory()) {
    const out = [];
    for (const [fname, artifact] of Object.entries(ARTIFACT_FILES)) {
      const fp = path.join(abs, fname);
      if (fs.existsSync(fp)) out.push({ file: fp, artifact });
    }
    return out;
  }
  const artifact = ARTIFACT_FILES[path.basename(abs)];
  if (!artifact) throw new MigrateError({ error: 'unknown-artifact', file: abs, message: `not a known fd artifact: ${path.basename(abs)}` });
  return [{ file: abs, artifact }];
}

function readArtifact(file) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new MigrateError({ error: 'invalid-json', file, message: err.message });
  }
  if (!Number.isInteger(value?.schema)) {
    throw new MigrateError({ error: 'missing-schema-field', file, message: `no integer "schema" field in ${file}` });
  }
  return value;
}

// Validate a migrated artifact only against a shipped schema that declares the same
// version — i.e. when the migration lands on the plugin's current version. Chains that
// stop short of it (test fixtures reaching v2/v3) have no matching schema and are skipped.
function validateFinal(artifact, version, value, file) {
  const schemaPath = path.join(SCHEMA_DIR, `${artifact}.schema.json`);
  if (!fs.existsSync(schemaPath)) return;
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  if (schema?.properties?.schema?.const !== version) return;
  try {
    assertValid(value, schema, path.basename(file));
  } catch (err) {
    throw new MigrateError({ error: 'invalid-after-migration', file, artifact, message: err.message });
  }
}

// Plans and validates the whole run before any write, so a missing/broken step aborts
// with no partial changes on disk. Runs the (pure) migrate chain in this phase too.
function planArtifact({ file, artifact }, byArtifact) {
  const value = readArtifact(file);
  const from = value.schema;
  const to = targetVersion(artifact, byArtifact);

  if (from === to) return { kind: 'current', file };
  if (from > to) {
    return { kind: 'blocked', entry: { error: 'workspace-newer', file, schema: from, supported: to, message: WORKSPACE_NEWER_MESSAGE } };
  }

  const steps = byArtifact.get(artifact);
  let migrated = value;
  for (let v = from; v < to; v++) {
    const step = steps && steps.get(v);
    if (!step || step.to !== v + 1) {
      throw new MigrateError({ error: 'missing-migration-step', artifact, from: v, to: v + 1, module: `${artifact}-${v}-to-${v + 1}.mjs`, file, message: `missing migration step ${artifact}-${v}-to-${v + 1}.mjs for ${file}` });
    }
    const { mod } = step;
    if (mod.artifact !== artifact || mod.from !== v || mod.to !== v + 1 || typeof mod.migrate !== 'function') {
      throw new MigrateError({ error: 'invalid-migration-module', module: step.name, expected: { artifact, from: v, to: v + 1 }, message: `migration module ${step.name} does not declare {artifact:"${artifact}", from:${v}, to:${v + 1}, migrate}` });
    }
    migrated = mod.migrate(migrated);
  }
  validateFinal(artifact, to, migrated, file);
  return { kind: 'migrate', file, artifact, from, to, value: migrated };
}

export async function runMigrate(target, options = {}) {
  const migrationsDir = path.resolve(options.migrationsDir || DEFAULT_MIGRATIONS_DIR);
  const byArtifact = await scanMigrations(migrationsDir);
  const files = resolveArtifactFiles(target);

  const plans = files.map((f) => planArtifact(f, byArtifact)); // throws before any write

  const report = { migrated: [], current: [], blocked: [] };
  for (const plan of plans) {
    if (plan.kind === 'current') {
      report.current.push(plan.file);
    } else if (plan.kind === 'blocked') {
      report.blocked.push(plan.entry);
    } else {
      const backup = `${plan.file}.bak-schema${plan.from}`;
      if (!options.dryRun) {
        fs.copyFileSync(plan.file, backup);
        const tmp = `${plan.file}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, serializeJson(plan.value));
        fs.renameSync(tmp, plan.file);
      }
      report.migrated.push({ file: plan.file, from: plan.from, to: plan.to, backup });
    }
  }
  return report;
}

function parseCliArgs(argv) {
  const args = { target: null, dryRun: false, migrationsDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--migrations-dir') args.migrationsDir = argv[++i];
    else if (!args.target) args.target = argv[i];
  }
  return args;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.target) {
    process.stdout.write(JSON.stringify({ error: 'usage: migrate.mjs <featureDir|artifactFile> [--dry-run] [--migrations-dir <dir>]' }) + '\n');
    process.exit(1);
  }
  try {
    const report = await runMigrate(args.target, { dryRun: args.dryRun, migrationsDir: args.migrationsDir || undefined });
    process.stdout.write(JSON.stringify(report) + '\n');
    process.exit(report.blocked.length > 0 ? 1 : 0);
  } catch (err) {
    const payload = err instanceof MigrateError ? err.payload : { error: err.message };
    process.stdout.write(JSON.stringify(payload) + '\n');
    process.exit(1);
  }
}

function isMain() {
  return process.argv[1] ? path.resolve(process.argv[1]) === import.meta.filename : false;
}

if (isMain()) main();

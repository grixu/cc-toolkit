#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertValid } from './lib/validate.mjs';
import { serializeJson, atomicWrite, readJson } from './lib/json-io.mjs';

// The single writer of sources-map.json. The grill produces complete records
// (claim/fact/quote/source/anchors/groundedAt) as plain JSON data files; this script
// merges, dedupes, and validates them into the map — commands never assemble the
// document inline or write it by hand.

const SCHEMA_PATH = path.join(import.meta.dirname, '..', 'schemas', 'sources-map.schema.json');

export class BuildSourcesMapError extends Error {}

// Identity = the claim grounded against one concrete source; the same claim backed by
// a second source is a distinct record, not a duplicate.
function recordKey(record) {
  return JSON.stringify([record.claim, record.source?.type, record.source?.ref]);
}

export function mergeRecords(prior, incoming) {
  const seen = new Set(prior.map(recordKey));
  const merged = [...prior];
  let added = 0;
  let duplicates = 0;
  for (const record of incoming) {
    const key = recordKey(record);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    merged.push(record);
    added += 1;
  }
  return { records: merged, added, duplicates };
}

function readRecordsFile(filePath) {
  const data = readJson(filePath);
  if (data === null) throw new BuildSourcesMapError(`records file missing or empty: ${filePath}`);
  const records = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(records)) {
    throw new BuildSourcesMapError(`records file must be a JSON array or {"records":[…]}: ${filePath}`);
  }
  return records;
}

export function runBuildSourcesMap(featureDir, opts = {}) {
  const recordFiles = opts.recordFiles ?? [];
  if (!opts.seed && recordFiles.length === 0) {
    throw new BuildSourcesMapError('nothing to do: pass --seed or at least one --records <file>');
  }
  const mapPath = path.join(featureDir, 'sources-map.json');
  const prior = readJson(mapPath) ?? { schema: 1, records: [] };

  let incoming = [];
  for (const file of recordFiles) incoming = incoming.concat(readRecordsFile(file));

  const { records, added, duplicates } = mergeRecords(prior.records ?? [], incoming);
  const doc = { schema: 1, records };

  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  // Refuse before write: an invalid record never lands on disk.
  assertValid(doc, schema, 'sources-map.json');

  const serialized = serializeJson(doc);
  const written = !opts.stdout;
  if (written) atomicWrite(mapPath, serialized);
  return { written, path: mapPath, total: records.length, added, duplicatesSkipped: duplicates };
}

function parseCliArgs(argv) {
  const args = { recordFiles: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--records') args.recordFiles.push(argv[++i]);
    else if (argv[i] === '--seed') args.seed = true;
    else if (argv[i] === '--stdout') args.stdout = true;
    else if (!args.featureDir) args.featureDir = argv[i];
  }
  return args;
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.featureDir) {
    process.stdout.write(JSON.stringify({
      error: 'usage: build-sources-map.mjs <featureDir> [--seed] [--records <file.json>]... [--stdout]',
    }) + '\n');
    process.exit(1);
  }
  try {
    const res = runBuildSourcesMap(args.featureDir, {
      seed: args.seed,
      recordFiles: args.recordFiles,
      stdout: args.stdout,
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

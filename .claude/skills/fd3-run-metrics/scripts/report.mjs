#!/usr/bin/env node
// Print a collect.mjs snapshot as tables, or compare it against a baseline snapshot.
//
//   node report.mjs <snapshot> [<baseline>]
import fs from 'node:fs';
import path from 'node:path';

const [snapDir, baseDir] = process.argv.slice(2);
if (!snapDir) {
  console.error('usage: node report.mjs <snapshot> [<baseline>]');
  process.exit(2);
}

const readJsonl = (file) =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const load = (dir) => ({
  dir,
  meta: JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')),
  runs: readJsonl(path.join(dir, 'runs.jsonl')),
  agents: readJsonl(path.join(dir, 'agents.jsonl')),
  branches: readJsonl(path.join(dir, 'branches.jsonl')),
  findings: readJsonl(path.join(dir, 'findings.jsonl')),
});

// A merged finding carries its rule family; a lens covers one or two families.
const LENS_OF_FAMILY = {
  simplicity: 'simplicity-types',
  types: 'simplicity-types',
  readability: 'readability-tests',
  tests: 'readability-tests',
  naming: 'naming-module',
  module: 'naming-module',
  objects: 'objects-patterns',
  patterns: 'objects-patterns',
};
const lensOf = (family) => LENS_OF_FAMILY[family] ?? family;
// The workflow sends a diff of up to this many files to one scanner covering every lens.
const SINGLE_SCAN_MAX_FILES = 3;
const MAX_FIX_ROUNDS = 3;

const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
const usd = (rows) => sum(rows, (r) => r.usd);

// Each section maps a row key to named numbers; workloads differ between snapshots, so spend is
// shown as a share and per run, never as a raw total next to another snapshot's total.
const sections = (s) => {
  const total = usd(s.agents);
  const nRuns = s.runs.length || 1;
  const nBranches = s.branches.length || 1;
  const spend = (key, rows = s.agents) =>
    new Map([...groupBy(rows, key)].map(([k, rs]) => [k, { n: rs.length, share: (100 * usd(rs)) / total, perRun: usd(rs) / nRuns }]));

  const scans = s.agents.filter((a) => a.cat === 'cr-scan');
  const findingsByLens = groupBy(s.findings, (f) => lensOf(f.family));
  const lensYield = new Map(
    [...groupBy(scans, (a) => a.lens)].map(([lens, rs]) => {
      const found = (findingsByLens.get(lens) || []).length;
      return [lens, { scans: rs.length, usd: usd(rs), findings: found, usdPerFinding: found ? usd(rs) / found : null }];
    }),
  );
  for (const [lens, fs_] of findingsByLens) if (!lensYield.has(lens)) lensYield.set(lens, { scans: 0, usd: 0, findings: fs_.length, usdPerFinding: null });

  const bucket = (a) => (a.filesTotal == null ? 'unknown' : a.filesTotal <= SINGLE_SCAN_MAX_FILES ? `<=${SINGLE_SCAN_MAX_FILES} files` : `>${SINGLE_SCAN_MAX_FILES} files`);
  const loopClass = (b) => {
    if (b.ci === 'no-verdict') return 'no verdict';
    if (b.fixRounds >= MAX_FIX_ROUNDS && b.ci !== 'passed') return 'exhausted';
    if (b.ci === 'passed') return b.fixRounds === 0 ? 'passed, 0 rounds' : 'passed after rounds';
    return 'failed, rounds left';
  };
  const fixers = s.agents.filter((a) => a.cat === 'fix-ci' || a.cat === 'fix-final');
  const commitState = (a) => (a.committed == null ? 'commit unknown' : a.committed ? 'committed' : 'no commit');
  const hil = s.runs.flatMap((r) => r.hil || []);

  return [
    ['Overview', new Map([['all', { runs: s.runs.length, agents: s.agents.length, branches: s.branches.length, usdPerRun: total / nRuns, usdPerBranch: total / nBranches }]])],
    ['Spend by category', spend((a) => a.cat)],
    ['Spend by model family', spend((a) => a.fam)],
    ['Scan spend by pass', spend((a) => a.pass ?? 'unlabelled', scans)],
    ['Scan spend by diff size', spend(bucket, scans)],
    ['Lens yield (merged findings vs scan spend)', lensYield],
    ['Fix loops per validated branch', new Map([...groupBy(s.branches, loopClass)].map(([k, bs]) => [k, { branches: bs.length, pct: (100 * bs.length) / nBranches }]))],
    ['Fix rounds', new Map([...groupBy(fixers, (a) => `${a.cat} ${commitState(a)}`)].map(([k, rs]) => [k, { n: rs.length, usd: usd(rs) }]))],
    ['CI verdicts by model', new Map([...groupBy(s.agents.filter((a) => a.ciVerdict), (a) => `${a.fam} ${a.ciVerdict}`)].map(([k, rs]) => [k, { n: rs.length }]))],
    ['Human-in-the-loop items per run', new Map([...groupBy(hil, (h) => h.kind)].map(([k, hs]) => [k, { n: hs.length, perRun: hs.length / nRuns }]))],
  ];
};

const fmt = (v) => (v == null ? '-' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
const snap = load(snapDir);
const base = baseDir ? load(baseDir) : null;
const describe = (s) => `${s.dir}: ${s.meta.since ?? '…'} → ${s.meta.until ?? '…'}, fd3 ${Object.keys(s.meta.fd3Versions).join(', ')}`;
console.log(base ? `baseline ${describe(base)}\nsnapshot ${describe(snap)}` : describe(snap));
console.log('List-price dollars, not Max-plan usage.');

const ours = sections(snap);
const theirs = base ? new Map(sections(base)) : null;
for (const [title, rows] of ours) {
  const baseRows = theirs?.get(title) ?? new Map();
  const keys = [...new Set([...rows.keys(), ...baseRows.keys()])];
  const cols = [...new Set([...rows.values(), ...baseRows.values()].flatMap((v) => Object.keys(v)))];
  const sortCol = cols.includes('share') ? 'share' : cols.includes('usd') ? 'usd' : cols[0];
  keys.sort((a, b) => (rows.get(b)?.[sortCol] ?? baseRows.get(b)?.[sortCol] ?? 0) - (rows.get(a)?.[sortCol] ?? baseRows.get(a)?.[sortCol] ?? 0));
  console.log(`\n## ${title}\nkey | ${cols.join(' | ')}`);
  for (const k of keys) {
    const cell = (c) => (base ? `${fmt(baseRows.get(k)?.[c])} → ${fmt(rows.get(k)?.[c])}` : fmt(rows.get(k)?.[c]));
    console.log(`${k} | ${cols.map(cell).join(' | ')}`);
  }
}

#!/usr/bin/env node
// Re-score every recorded /tester:run against the current matcher, without spending a token.
//
// The report matcher has been wrong ten separate ways and not one was found by reading it —
// every fix came from replaying a real transcript. Run this after touching asserts/run.js or
// answer-key.json: a change that scores a defect the run plainly reported, or condemns a
// criterion the run plainly passed, shows up here in seconds instead of after a paid run.
//
//   node plugins/tester/evals/replay.js                    # re-score + compare to the baseline
//   node plugins/tester/evals/replay.js --update-baseline  # bless the current scores
//
// `from tables` and `from report` are the two independent signals, listed as caught defect ids
// from the answer key. They should agree on any run that finished; a defect in one column and
// not the other is worth looking at.
//
// replay-baseline.json is the committed golden record of what the matcher extracts from each
// session. Without it, false positives were the only failure this script could see — a change
// that LOSES recall on old transcripts passed silently. A normal run compares every session
// against its baseline entry and fails on any regression: recall dropping, a false positive
// appearing, or a session's parsed rows collapsing to zero. Baseline sessions whose transcript
// is not on this machine are skipped silently — the corpus is per-machine, the baseline is not.
const fs = require('fs');
const path = require('path');

const m = require('./asserts/run.js');
const { transcriptFiles } = require('./lib/transcripts.js');

const APP = path.join(__dirname, '.sandbox', 'target-app');
const BASELINE_FILE = path.join(__dirname, 'replay-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

const longestAssistantText = (raw) => {
  let best = '';
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== 'assistant' || !Array.isArray(rec.message?.content)) continue;
    const t = rec.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (t.length > best.length) best = t;
  }
  return best;
};

const runs = [];
for (const full of transcriptFiles(APP)) {
  const raw = fs.readFileSync(full, 'utf8');
  if (!raw.includes('<command-name>/tester:run</command-name>')) continue;
  const first = raw.split('\n').find((l) => l.trim());
  const rows = m.suiteRows(full);
  const report = longestAssistantText(raw);
  // Caught defects per signal, by id; false positives stay AC-based on fully-correct criteria.
  const tables = m.matchDefects(m.failingBlocksFromRows(rows));
  const prose = m.matchDefects(m.markedFailedBlocks(report));
  const both = new Set([...tables, ...prose]);
  const failedAcs = new Set([...m.acsFailedInTables(rows), ...m.acsMarkedFailed(report)]);
  runs.push({
    session: path.basename(full, '.jsonl'),
    id: path.basename(full).slice(0, 8),
    at: (JSON.parse(first).timestamp || '').replace('T', ' ').slice(0, 19),
    rows: rows.length,
    tables: m.DEFECTS.filter((d) => tables.has(d.id)).map((d) => d.id).join(' ') || '-',
    prose: m.DEFECTS.filter((d) => prose.has(d.id)).map((d) => d.id).join(' ') || '-',
    recall: `${m.DEFECTS.filter((d) => both.has(d.id)).length}/${m.DEFECTS.length}`,
    fp: m.ACS_FULLY_CORRECT.filter((a) => failedAcs.has(a)).join(' ') || 'none',
  });
}

if (!runs.length) {
  console.log('No recorded /tester:run transcripts found. Run the suite once, then replay.');
  process.exit(0);
}

runs.sort((a, b) => (a.at < b.at ? -1 : 1));
const cols = [
  ['session', 'id', 8], ['started', 'at', 19], ['rows', 'rows', 4],
  ['from tables', 'tables', 20], ['from report', 'prose', 20],
  ['recall', 'recall', 6], ['false pos', 'fp', 9],
];
console.log(cols.map(([h, , w]) => h.padEnd(w)).join(' | '));
for (const r of runs) console.log(cols.map(([, k, w]) => String(r[k]).padEnd(w)).join(' | '));

if (updateBaseline) {
  const baseline = {};
  for (const r of runs) {
    baseline[r.session] = { rows: r.rows, tables: r.tables, prose: r.prose, recall: r.recall, fp: r.fp };
  }
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\nBaseline written: ${runs.length} session(s) → ${path.relative(process.cwd(), BASELINE_FILE)}`);
}

// ---- Regressions against the golden baseline ------------------------------------------------
const regressions = [];
let compared = 0;
if (!updateBaseline && fs.existsSync(BASELINE_FILE)) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const caught = (recall) => Number(recall.split('/')[0]);
  for (const r of runs) {
    const b = baseline[r.session];
    if (!b) continue; // recorded after the last blessing — nothing to regress against
    compared++;
    if (caught(r.recall) < caught(b.recall)) {
      regressions.push(`${r.id}: recall dropped ${b.recall} → ${r.recall}`);
    }
    if (r.fp !== 'none' && b.fp === 'none') {
      regressions.push(`${r.id}: new false positive(s): ${r.fp}`);
    }
    if (r.rows === 0 && b.rows > 0) {
      regressions.push(`${r.id}: suite-table rows collapsed ${b.rows} → 0`);
    }
  }
  console.log(regressions.length
    ? `\nBASELINE REGRESSIONS (${regressions.length}):\n  ${regressions.join('\n  ')}`
    : `\nBaseline: no regressions across ${compared} session(s).`);
} else if (!updateBaseline) {
  console.log('\nNo replay-baseline.json — run with --update-baseline to bless the current scores.');
}

const bad = runs.filter((r) => r.fp !== 'none');
console.log(bad.length
  ? `${bad.length} run(s) with FALSE POSITIVES: ${bad.map((r) => r.id).join(', ')}`
  : 'No false positives in any recorded run.');
process.exit(bad.length || regressions.length ? 1 : 0);

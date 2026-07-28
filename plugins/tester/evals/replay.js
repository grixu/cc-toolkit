#!/usr/bin/env node
// Re-score every recorded /tester:run against the current matcher, without spending a token.
//
// The report matcher has been wrong five separate ways and not one was found by reading it —
// every fix came from replaying a real transcript. Run this after touching asserts/run.js or
// answer-key.json: a change that scores a defect the run plainly reported, or condemns a
// criterion the run plainly passed, shows up here in seconds instead of after a paid run.
//
//   node plugins/tester/evals/replay.js
//
// `from tables` and `from report` are the two independent signals. They should agree on any run
// that finished; a criterion in one column and not the other is worth looking at.
const fs = require('fs');
const os = require('node:os');
const path = require('path');

const m = require('./asserts/run.js');

const APP = path.join(__dirname, '.sandbox', 'target-app');
const encoded = APP.replace(/[^A-Za-z0-9]/g, '-');
const stores = [...new Set(
  [
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), '.ccs', 'instances', 'personal', 'projects'),
    path.join(os.homedir(), '.ccs', 'instances', 'work', 'projects'),
    path.join(os.homedir(), '.ccs', 'shared', 'context-groups', 'mg', 'projects'),
  ].map((p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  }),
)];

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
for (const store of stores) {
  const dir = path.join(store, encoded);
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    continue;
  }
  for (const f of files) {
    const full = path.join(dir, f);
    const raw = fs.readFileSync(full, 'utf8');
    if (!raw.includes('<command-name>/tester:run</command-name>')) continue;
    const first = raw.split('\n').find((l) => l.trim());
    const rows = m.suiteRows(full);
    const tables = m.acsFailedInTables(rows);
    const prose = m.acsMarkedFailed(longestAssistantText(raw));
    const both = new Set([...tables, ...prose]);
    runs.push({
      id: f.slice(0, 8),
      at: (JSON.parse(first).timestamp || '').replace('T', ' ').slice(0, 19),
      rows: rows.length,
      tables: m.ACS_WITH_DEFECT.filter((a) => tables.has(a)).join(' ') || '-',
      prose: m.ACS_WITH_DEFECT.filter((a) => prose.has(a)).join(' ') || '-',
      recall: `${m.ACS_WITH_DEFECT.filter((a) => both.has(a)).length}/${m.ACS_WITH_DEFECT.length}`,
      fp: m.ACS_FULLY_CORRECT.filter((a) => both.has(a)).join(' ') || 'none',
    });
  }
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

const bad = runs.filter((r) => r.fp !== 'none');
console.log(bad.length
  ? `\n${bad.length} run(s) with FALSE POSITIVES: ${bad.map((r) => r.id).join(', ')}`
  : '\nNo false positives in any recorded run.');
process.exit(bad.length ? 1 : 0);

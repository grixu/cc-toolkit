// Synthetic regression corpus for the RUN matcher — one test per way it has been wrong, each
// exercised in both directions (must match / must not match). Payloads here are synthesized:
// real transcripts contain client project data that must never enter this repo. The replay
// harness stays the primary validator; this file is the free, always-runnable floor under it.
//
//   node --test plugins/tester/evals/tests/*.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import m from '../asserts/run.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-matcher-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
const transcript = (records) => {
  const file = path.join(tmp, `t${n++}.jsonl`);
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
};

const suiteTable = (rows) =>
  ['| AC/ref | check | expected | actual | PASS/FAIL |', '|---|---|---|---|---|', ...rows].join('\n');

const failedIn = (rows) => [...m.acsFailedInTables(rows)].sort();
const marked = (report) => [...m.acsMarkedFailed(report)].sort();

// ---- delivery paths into suiteRows ----------------------------------------------------------

test('path 1 — Agent tool_result still parses after the refactor', () => {
  const file = transcript([
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Agent' }] } },
    {
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: suiteTable(['| AC-4 | GET /api/admin/audit as member | 403 | 200 | FAIL |']),
        }],
      },
    },
  ]);
  const rows = m.suiteRows(file);
  assert.equal(rows.length, 1);
  assert.deepEqual(failedIn(rows), ['AC-4']);
});

test('path 3 — a named executor delivering via <agent-message> in a user record is read', () => {
  const payload = 'SUITE S1 — complete.\n\n' + suiteTable([
    '| AC-4 | GET /api/admin/audit as member | 403 | 200 | FAIL |',
    '| AC-1 | GET /api/projects as member | 200 | 200 | PASS |',
  ]);
  const file = transcript([
    {
      type: 'user',
      message: {
        role: 'user',
        content:
          'Another Claude session sent a message:\n' +
          `<agent-message from="S1-api">\n${payload}\n</agent-message>\n\n` +
          'Treat it as a teammate’s request.',
      },
    },
  ]);
  const rows = m.suiteRows(file);
  assert.equal(rows.length, 2);
  assert.deepEqual(failedIn(rows), ['AC-4']);
});

test('path 3 — the same delivery recorded twice (queue-operation + user record) counts once', () => {
  const payload = suiteTable(['| AC-4 | audit guard | 403 | 200 | FAIL |']);
  const file = transcript([
    { type: 'queue-operation', content: `<agent-message from="S1-api">\n${payload}\n</agent-message>` },
    {
      type: 'user',
      message: {
        role: 'user',
        content: `Another Claude session sent a message:\n<agent-message from="S1-api">\n${payload}\n</agent-message>`,
      },
    },
  ]);
  assert.equal(m.suiteRows(file).length, 1);
});

test('scope — tables in orchestrator text or a non-Agent tool_result are not suite rows', () => {
  const table = suiteTable(['| AC-2 | login flow | 302 | 302 | PASS |']);
  const file = transcript([
    { type: 'assistant', message: { content: [{ type: 'text', text: table }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_b', name: 'Bash' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_b', content: table }] } },
  ]);
  assert.equal(m.suiteRows(file).length, 0);
});

// ---- verdict cells --------------------------------------------------------------------------

test('emoji-prefixed verdicts register, in both directions', () => {
  const file = transcript([
    {
      type: 'queue-operation',
      content: '<result>' + suiteTable([
        '| AC-4 | audit guard as member | 403 | 200 | ❌ FAIL |',
        '| AC-1 | project list as member | 200 | 200 | ✅ PASS |',
        '| AC-5 | PDP outage behaviour | 503 | not run | 🚫 BLOCKED |',
      ]) + '</result>',
    },
  ]);
  const rows = m.suiteRows(file);
  assert.deepEqual(rows.map((r) => r.verdict), ['FAIL', 'PASS', 'BLOCKED']);
  // ✅ PASS must not read as a failure; ❌ FAIL must.
  assert.deepEqual(failedIn(rows), ['AC-4']);
});

test('delta tables — the rightmost verdict cell is the current one and decides', () => {
  const file = transcript([
    {
      type: 'queue-operation',
      content: '<result>| AC | run 1 | run 2 |\n|---|---|---|\n' +
        '| AC-3 | ❌ FAIL | ✅ PASS (fixed) |\n' +
        '| AC-4 | ✅ PASS | ❌ FAIL (regressed) |</result>',
    },
  ]);
  const rows = m.suiteRows(file);
  assert.deepEqual(rows.map((r) => r.verdict), ['PASS', 'FAIL']);
  assert.deepEqual(failedIn(rows), ['AC-4']);
});

test('delta tables in the closing report follow the same rule', () => {
  const head = '## Re-verification of failed ACs\n\n| AC | run 1 | run 2 |\n|---|---|---|\n';
  assert.deepEqual(marked(head + '| AC-3 | ❌ FAIL | ✅ PASS (fixed) |'), []);
  assert.deepEqual(marked(head + '| AC-3 | ❌ FAIL | ❌ FAIL (still) |'), ['AC-3']);
});

// ---- prose failure markers ------------------------------------------------------------------

test('spec-defect condemns the criterion exactly as impl-defect does', () => {
  assert.deepEqual(
    marked('AC-5 — spec-defect: the spec requires 503 on PDP outage; the impl returns 200.'),
    ['AC-5'],
  );
  assert.deepEqual(marked('AC-5 — consistent with the spec; returns 503 on PDP outage.'), []);
});

test('negation suppresses per sentence, not per block', () => {
  // A tally and a genuine defect statement in one paragraph: the defect must still count.
  assert.deepEqual(
    marked('The fault suite returned 9 PASS, 1 FAIL.\nAC-5 fails open when the PDP is paused. 🔴'),
    ['AC-5'],
  );
  // Pure tallies and rule-outs must still not count.
  assert.deepEqual(marked('Across all suites: 27 PASS, 3 FAIL — see the tables for AC-2.'), []);
  assert.deepEqual(marked('AC-6 did not score a second FAIL.'), []);
  assert.deepEqual(marked('AC-1 and AC-2 pass cleanly with no FAIL anywhere.'), []);
});

// ---- the five historical prose modes --------------------------------------------------------

test('a URL containing "failed" inside a PASS row is not a failure', () => {
  const report =
    '## API suite\n\n' +
    suiteTable(['| AC-2 | GET /login?failed=1 shows the error banner | banner | banner | PASS |']);
  assert.deepEqual(marked(report), []);
});

test('an AC id inside a range names the span, not a failing criterion', () => {
  assert.deepEqual(
    marked('🔴 One defect across the sweep AC-1…AC-8: AC-4 lets members read the audit log.'),
    ['AC-4'],
  );
});

test('a verdict-less defects table condemns by membership — only under a failure heading', () => {
  const table = '| AC-4 | audit endpoint reachable by members |\n| AC-3 | ownership check exempts admins |';
  assert.deepEqual(marked(`## Defects found\n\n${table}`), ['AC-3', 'AC-4']);
  assert.deepEqual(marked(`## Checks executed\n\n${table}`), []);
  // A table whose rows carry explicit verdict cells is never verdict-less.
  assert.deepEqual(marked('## Defects found\n\n| AC-1 | login flow | ✅ PASS |'), []);
});

test('a defect write-up citing other ACs as context condemns only its lead-in subject', () => {
  const report =
    '**🔴 AC-3 — ownership check exempts admins.**\n' +
    'The spec denies transfer unconditionally, though it grants admins reach elsewhere (AC-1, AC-2).';
  assert.deepEqual(marked(report), ['AC-3']);
});

test('an H1 title announcing defects scopes nothing', () => {
  assert.deepEqual(marked('# Verdict: 2 defects across 8 ACs\n\n| AC-1 | login flow |'), []);
});

// ---- per-defect attribution -----------------------------------------------------------------
// Recall is scored per defect id. A defect alone on its AC is caught by the criterion name; two
// defects sharing an AC are told apart by the key's keywords, which is what keeps those lists
// load-bearing. Synthetic defect lists are injected because the real key has no shared AC yet.

test('a defect alone on its AC is caught by naming the criterion, no keyword needed', () => {
  const blocks = [{ text: '| AC-9 | GET with over-long id, PDP up | 403 | 503 | FAIL |', acs: ['AC-9'] }];
  assert.ok(m.matchDefects(blocks).has('D5'));
});

test('same-AC defects disambiguate by keywords — one caught, one not', () => {
  const defects = [
    { id: 'X1', ac: 'AC-5', keywords: ['fails open'] },
    { id: 'X2', ac: 'AC-5', keywords: ['stale cache'] },
  ];
  const blocks = [{ text: 'AC-5 — GET /api/projects fails open when the PDP is paused.', acs: ['AC-5'] }];
  const caught = m.matchDefects(blocks, defects);
  assert.ok(caught.has('X1'));
  assert.ok(!caught.has('X2'));
});

test('keyword attribution is case-insensitive and reads the failing row text end to end', () => {
  const defects = [
    { id: 'X1', ac: 'AC-4', keywords: ['audit'] },
    { id: 'X2', ac: 'AC-4', keywords: ['export'] },
  ];
  const file = transcript([
    {
      type: 'queue-operation',
      content: '<result>' + suiteTable(['| AC-4 | GET /api/admin/AUDIT as member | 403 | 200 | FAIL |']) + '</result>',
    },
  ]);
  const caught = m.matchDefects(m.failingBlocksFromRows(m.suiteRows(file)), defects);
  assert.deepEqual([...caught], ['X1']);
});

test('a keyword in a different failing block does not bridge to the AC-naming one', () => {
  const defects = [
    { id: 'X1', ac: 'AC-5', keywords: ['fails open'] },
    { id: 'X2', ac: 'AC-5', keywords: ['delete'] },
  ];
  const blocks = [
    { text: 'AC-5 — the list fails open under a paused PDP.', acs: ['AC-5'] },
    { text: 'AC-2 — delete returned 200 for a member.', acs: ['AC-2'] },
  ];
  const caught = m.matchDefects(blocks, defects);
  assert.ok(caught.has('X1'));
  assert.ok(!caught.has('X2'));
});

test('prose failing blocks carry their text into keyword attribution', () => {
  const defects = [
    { id: 'X1', ac: 'AC-3', keywords: ['ownership'] },
    { id: 'X2', ac: 'AC-3', keywords: ['expiry'] },
  ];
  const report = '**🔴 AC-3 — the ownership check exempts admins.**\nPATCH crossed user boundaries.';
  const caught = m.matchDefects(m.markedFailedBlocks(report), defects);
  assert.ok(caught.has('X1'));
  assert.ok(!caught.has('X2'));
});

// Model-free tests for the eval checks, fed real run artifacts (anonymised under __fixtures__/) that
// a check once judged wrongly, and texts it must keep failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as h from './helpers.mjs';
import * as s from './checks/split-shared.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const tasksOf = (name) => h.readTasksDir(path.join(FIXTURES, name));
const failures = (fn) => {
  const c = h.checker();
  fn(c);
  const v = c.verdict();
  return v.pass ? [] : v.reason.split('; ');
};
const bySlug = (tasks, slug) => tasks.find((t) => t.slug === slug);
const setMergeAfter = (tasks, values) => {
  for (const t of tasks) t.fm['merge-after'] = values[t.slug] || [];
  return tasks;
};
const A = '/sandbox/split/repo-a';
const B = '/sandbox/split/repo-b';

// 8b38fd14 held its phase-2 switch behind phase 1 only in report prose: base main, no edge.
test('split hold: a phase-2 branch held only in prose fails', () => {
  const f = failures((c) => s.checkBoundaries(c, tasksOf('split-protected-path-8b38fd14'), { precedesDb: 'CI-1' }));
  assert.ok(f.some((x) => /0006-checkout-settlement-switch\.md: phase-2 branch .* by no stack, edge or merge-after/.test(x)), f.join('\n'));
});

test('split hold: the same split passes once merge-after carries the holds', () => {
  const tasks = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), {
    'checkout-settlement-switch': ['feat/checkout-settlement-write', `${B}:feat/payment-status-panel`],
    'payment-status-live': [`${A}:feat/checkout-settlement-write`],
  });
  assert.deepEqual(failures((c) => s.checkBoundaries(c, tasks, { precedesDb: 'CI-1' })), []);
});

test('split hold: a hold transitive through a chain counts, a same-repository-only hold does not', () => {
  const tasks = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), {
    'checkout-settlement-switch': ['feat/checkout-settlement-write'],
    'payment-status-live': [`${A}:feat/checkout-settlement-write`],
  });
  const f = failures((c) => s.checkBoundaries(c, tasks, { precedesDb: 'CI-1' }));
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /checkout-settlement-switch .* held behind feat\/payment-status-panel by no/);
});

test('split hold: merge-after naming an unbuilt branch, two values on a branch, and a loop fail', () => {
  const unbuilt = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), { 'payment-status-panel': ['feat/nowhere'] });
  assert.ok(failures((c) => s.checkMergeAfter(c, unbuilt)).some((x) => /"feat\/nowhere" names a branch no task builds/.test(x)));
  const loop = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), { 'ci-migration-step': ['feat/checkout-settlement-write'] });
  assert.ok(failures((c) => s.checkMergeAfter(c, loop)).some((x) => /held behind itself/.test(x)));
  const split = tasksOf('split-protected-path-8b38fd14');
  const twin = { ...bySlug(split, 'payment-status-panel'), file: '0008-panel-docs.md', slug: 'panel-docs' };
  twin.fm = { ...twin.fm, 'merge-after': [`${A}:feat/ci-migration-step`] };
  assert.ok(failures((c) => s.checkMergeAfter(c, [...split, twin])).some((x) => /2 different merge-after values/.test(x)));
});

// f26743d6 predates the field: its flag branch stacks on repo-a's chain but nothing holds it behind
// repo-b's panel, and the live branch's edges miss checkout's write.
test('split hold: a split written without merge-after fails the field and the cross-repository holds', () => {
  const tasks = tasksOf('split-baseline-f26743d6');
  const structure = failures((c) => s.checkTaskStructure(c, tasks));
  assert.ok(structure.some((x) => /frontmatter is missing merge-after/.test(x)));
  const f = failures((c) => s.checkBoundaries(c, tasks));
  assert.ok(f.some((x) => /0005-checkout-settlement-flag\.md: .* held behind feat\/payment-status-panel by no/.test(x)), f.join('\n'));
  assert.ok(f.some((x) => /0006-payment-status-live-endpoint\.md: .* held behind feat\/checkout-settlement-write by no/.test(x)), f.join('\n'));
});

const note = (file) => h.section(h.readTasksDir(path.join(FIXTURES, 'notes')).find((t) => t.file === file).body, 'Note');

// 828326cf wrote "phase-2 *deploy*" and b5432f4b wrapped "platform\nteam" across a line: both Notes
// carry the facts the literal regexes missed.
test('declared-gap note: a hyphenated phase and a wrapped owner still count', async () => {
  const { checkGapNote } = await import('./checks/split-declared-gap.mjs');
  for (const file of ['split-declared-gap-828326cf.md', 'split-declared-gap-b5432f4b.md']) {
    assert.deepEqual(failures((c) => checkGapNote(c, file, note(file))), [], file);
  }
});

test('declared-gap note: a note without owner or placement fails', async () => {
  const { checkGapNote } = await import('./checks/split-declared-gap.mjs');
  const f = failures((c) => checkGapNote(c, 'x.md', 'No pull request exists for this task: the work is a measurement by hand.'));
  assert.equal(f.length, 2, f.join('\n'));
});

// 8b38fd14's CI-1 Note says the approval is "nothing to confirm before writing the code".
test('protected-path note: a negated confirmation is not an ask, an affirmed one is', async () => {
  const { checkNoPendingAsk } = await import('./checks/split-protected-path.mjs');
  assert.deepEqual(failures((c) => checkNoPendingAsk(c, tasksOf('split-protected-path-8b38fd14'))), []);
  const ask = (text) => failures((c) => checkNoPendingAsk(c, [{ file: 'x.md', body: `## Goal\n\n## Note\n\n${text}\n` }]));
  assert.equal(ask('Confirm with release-team\nbefore editing the workflow.').length, 1);
  assert.equal(ask('Do not start until you get approval from release-team before touching `.github/`.').length, 1);
  assert.equal(ask('There is no need to confirm before editing: the review is the approval.').length, 0);
});

test('normalizeProse joins wraps, hyphens and emphasis', () => {
  assert.equal(h.normalizeProse('the **platform**\n  team holds the phase-2 rate-limit'), 'the platform team holds the phase 2 rate limit');
});

const grill = (name) => fs.readFileSync(path.join(FIXTURES, 'grill', name), 'utf8');
const noTool = { providerResponse: { metadata: { toolCalls: [{ name: 'Bash' }] } } };

// 225b31aa posted round 1 in message 2 and ended on a lookup update; 4137a407 ended on one that
// re-listed numbered findings. Neither final message is the round.
test('latest round: a lookup update after the round is not the round', () => {
  assert.equal(h.lastRound(grill('lookup-update-225b31aa.md')), null);
  assert.equal(h.lastRound(grill('lookup-update-4137a407.md')), null);
  const f = h.latestRoundFailures(grill('lookup-update-225b31aa.md'), h.parseLedger(grill('ledger-225b31aa.md')), noTool);
  assert.match(f.join('\n'), /ledger's round 1 asks .* not the latest round/);
});

test('latest round: the round itself, or a reprint of it in full, is the latest round', () => {
  assert.deepEqual(h.latestRoundFailures(grill('round-225b31aa.md'), h.parseLedger(grill('ledger-225b31aa.md')), noTool), []);
  assert.deepEqual(h.latestRoundFailures(grill('reprint-9ff1f0b7.md'), h.parseLedger(grill('ledger-9ff1f0b7.md')), noTool), []);
});

test('latest round: a later ledger round or an answer nobody gave fails', () => {
  const ledger = h.parseLedger(grill('ledger-225b31aa.md'));
  const later = [...ledger, { label: '9', round: 2, answer: 'open' }];
  assert.match(h.latestRoundFailures(grill('round-225b31aa.md'), later, noTool).join('\n'), /round 2 asks 9/);
  const selfAnswered = ledger.map((r, i) => (i === 0 ? { ...r, answer: 'a) Keep 5' } : r));
  assert.match(h.latestRoundFailures(grill('round-225b31aa.md'), selfAnswered, noTool).join('\n'), /answers to 1 that no user gave/);
  const viaTool = { providerResponse: { metadata: { toolCalls: [{ name: 'AskUserQuestion' }] } } };
  assert.deepEqual(h.latestRoundFailures(grill('round-225b31aa.md'), selfAnswered, viaTool), []);
});

// 39b47064 and c547b433: both AskUserQuestion calls came back with this error, the run ended
// telling the user it could not reach them, and the check passed on verdict lines alone.
const abort = { name: 'AskUserQuestion', is_error: true, output: 'Tool permission request failed: AbortError: Stream closed' };
const answered = { name: 'AskUserQuestion', is_error: false, output: 'User has answered your questions.' };
const calls = (...toolCalls) => ({ providerResponse: { metadata: { toolCalls } } });

test('question tool: a run whose last AskUserQuestion aborted never reached the user', () => {
  assert.equal(h.questionToolFailed(calls({ name: 'Read' }, abort, { name: 'Bash' }, abort)), true);
  assert.equal(h.questionToolFailed(calls({ ...abort, is_error: false })), true);
});

test('question tool: an answered question, a retry that got through, or no question at all passes', () => {
  assert.equal(h.questionToolFailed(calls(answered)), false);
  assert.equal(h.questionToolFailed(calls(abort, answered)), false);
  assert.equal(h.questionToolFailed(calls({ name: 'Read' })), false);
  assert.equal(h.questionToolFailed(undefined), false);
});

test('notes search: hunting for the notes by name counts, reading or listing the given path does not', () => {
  const name = /grilling|summary/i;
  const hunt = (call) => h.searchesFor(calls(call), name).length;
  assert.equal(hunt({ name: 'Glob', input: { pattern: '**/grilling-summary*' } }), 1);
  assert.equal(hunt({ name: 'Bash', input: { command: 'find .. -name "grilling-summary.md"' } }), 1);
  assert.equal(hunt({ name: 'Grep', input: { pattern: 'grilling summary' } }), 1);
  assert.equal(hunt({ name: 'Read', input: { file_path: 'notes/grilling-summary.md' } }), 0);
  assert.equal(hunt({ name: 'Bash', input: { command: 'ls -la notes/grilling-summary.md' } }), 0);
  assert.equal(hunt({ name: 'Bash', input: { command: 'find . -type f' } }), 0);
});

const shape = (text) => h.roundShapeFailures(text);
const round = grill('round-225b31aa.md');

test('round shape: rounds closed by their labels, lettered options under each question, pass', () => {
  for (const name of ['round-225b31aa.md', 'round-e375166f.md', 'reprint-9ff1f0b7.md']) assert.deepEqual(shape(grill(name)), [], name);
});

// 155659a9 closed on "Please answer:" and lettered its sub-questions 3a/3b/3c, the same letters
// its options carry.
test('round shape: a round with no "Answer as:" line, or with lettered sub-questions, fails', () => {
  const text = grill('round-155659a9.md');
  assert.match(shape(text).join('\n'), /no round with an "Answer as:" line/);
  assert.match(shape(text.replace('Please answer:', 'Answer as:')).join('\n'), /sub-questions 3a, 3b, 3c carry letters/);
});

test('round shape: an option without its letter, a label nobody asks, a hole and a trailing question fail', () => {
  assert.match(shape(round.replace('- **b) Drop to 3**', '- **Drop to 3**')).join('\n'), /question 1 has a named option without its letter/);
  assert.match(shape(round.replace('Answer as: 1, 2,', 'Answer as: 1, 2, 2.5,')).join('\n'), /names 2\.5 but no numbered question/);
  const hole = round.replace(/\*\*4\. Should there be[\s\S]*?\n\n\*\*5\./, '**5.').replace(' 4, 5,', ' 5,');
  assert.match(shape(hole).join('\n'), /skips question 4 without naming it/);
  assert.deepEqual(shape(`Open from earlier rounds: none. Blocked by the lookup: 4 (timeouts).\n\n${hole}`), []);
  assert.match(shape(`${round}\nShall I also look at the logs?`).join('\n'), /goes on past the round/);
});

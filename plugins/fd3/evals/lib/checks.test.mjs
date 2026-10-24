// Model-free tests for the eval checks, fed real run artifacts (anonymised under __fixtures__/) that
// a check once judged wrongly, and texts it must keep failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

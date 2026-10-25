#!/usr/bin/env node
// Parses a tasks directory written by split-to-tasks, checks the graph, and prints JSON:
// { dir, specPaths, tasks, launch, landing, problems }. Derived on every call and never written to disk —
// the task files stay the only store.
//
// Usage: node task-graph.mjs <tasks dir>
// Exit: 0 clean, 2 problems found (the JSON is printed either way), 1 usage error.

import fs from 'node:fs';
import path from 'node:path';

const STATUSES = ['todo', 'in-progress', 'implemented', 'merged', 'blocked', 'done'];
const TASK_FILE = /^(\d+)-(.+)\.md$/;
const LIST_KEYS = new Set(['elements', 'decisions', 'depends-on', 'merge-after', 'tickets']);

function fail(message) {
  process.stderr.write(`task-graph: ${message}\n`);
  process.exit(1);
}

function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// The flat subset the task template uses: `key: value`, `key: [a, b]`, `key:` and indented
// `- item` lists. Anything else is reported rather than guessed at.
function parseFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!m) return { fm: null, errors: ['no YAML frontmatter'] };
  const fm = {};
  const errors = [];
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item) {
      if (listKey === null) errors.push(`list item outside a key: "${line.trim()}"`);
      else fm[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line);
    if (!kv) {
      errors.push(`unreadable line: "${line.trim()}"`);
      listKey = null;
      continue;
    }
    const [, key, raw = ''] = kv;
    const val = raw.trim();
    listKey = null;
    if (val === '') {
      fm[key] = [];
      listKey = key;
    } else if (val.startsWith('[')) {
      if (!val.endsWith(']')) errors.push(`${key}: unterminated list`);
      const inner = val.replace(/^\[/, '').replace(/\]$/, '').trim();
      fm[key] = inner === '' ? [] : inner.split(',').map(unquote).filter((v) => v !== '');
    } else {
      fm[key] = unquote(val);
    }
  }
  // A bare `key:` is either an empty scalar or the head of a block list; settle it after the loop.
  for (const [k, v] of Object.entries(fm)) if (Array.isArray(v) && v.length === 0 && !LIST_KEYS.has(k)) fm[k] = '';
  return { fm, errors };
}


function asList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v !== '') return [v];
  return [];
}

function resolveDir(arg) {
  const dir = path.resolve(arg);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`not a directory: ${dir}`);
  const hasTasks = (d) => fs.readdirSync(d).some((f) => TASK_FILE.test(f));
  if (hasTasks(dir)) return dir;
  const nested = path.join(dir, 'tasks');
  if (fs.existsSync(nested) && fs.statSync(nested).isDirectory() && hasTasks(nested)) return nested;
  fail(`no task files (<NNNN>-<slug>.md) in ${dir}`);
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') fail('usage: node task-graph.mjs <tasks dir>');
const dir = resolveDir(arg);

const problems = [];
const problem = (kind, tasks, detail) => problems.push({ kind, tasks, detail });

const tasks = fs
  .readdirSync(dir)
  .filter((f) => TASK_FILE.test(f))
  .sort()
  .map((f) => {
    const [, ordinal, slug] = TASK_FILE.exec(f);
    const file = path.join(dir, f);
    const { fm, errors } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    for (const e of errors) problem('frontmatter', [slug], `${f}: ${e}`);
    const get = (k) => (fm && typeof fm[k] === 'string' ? fm[k] : '');
    return {
      ordinal: Number(ordinal),
      slug,
      file,
      name: get('name'),
      status: get('status'),
      spec: get('spec'),
      elements: asList(fm && fm.elements),
      decisions: asList(fm && fm.decisions),
      repository: get('repository'),
      branch: get('branch'),
      branchBase: get('branch-base'),
      mergeAfter: asList(fm && fm['merge-after']),
      worktree: get('worktree'),
      phase: get('phase'),
      dependsOn: asList(fm && fm['depends-on']),
      tickets: asList(fm && fm.tickets),
    };
  });

const bySlug = new Map();
for (const t of tasks) {
  if (bySlug.has(t.slug)) problem('duplicate-slug', [bySlug.get(t.slug).slug], `two files carry slug ${t.slug}`);
  else bySlug.set(t.slug, t);
}

for (const t of tasks) {
  if (!STATUSES.includes(t.status)) problem('status', [t.slug], `status "${t.status}" is not one of ${STATUSES.join(', ')}`);
  for (const d of t.dependsOn) {
    const dep = bySlug.get(d);
    if (!dep) problem('dangling-edge', [t.slug], `depends-on "${d}" names no task in this directory`);
    else if (dep.ordinal >= t.ordinal) problem('edge-order', [t.slug, d], `depends-on "${d}" does not point at a lower ordinal`);
  }
}

// Ordinals are meant to be topological, but a mis-numbered file can still hide a cycle.
{
  const state = new Map();
  const stack = [];
  const visit = (slug) => {
    state.set(slug, 'open');
    stack.push(slug);
    for (const d of bySlug.get(slug).dependsOn) {
      if (!bySlug.has(d)) continue;
      if (state.get(d) === 'open') problem('cycle', stack.slice(stack.indexOf(d)), `dependency cycle: ${[...stack.slice(stack.indexOf(d)), d].join(' -> ')}`);
      else if (!state.has(d)) visit(d);
    }
    stack.pop();
    state.set(slug, 'closed');
  };
  for (const slug of bySlug.keys()) if (!state.has(slug)) visit(slug);
}

const branches = new Map();
for (const t of tasks) {
  if (t.repository === 'none' || !t.branch) continue;
  const key = `${t.repository}\0${t.branch}`;
  if (!branches.has(key)) branches.set(key, []);
  branches.get(key).push(t);
}
for (const group of branches.values()) {
  const bases = [...new Set(group.map((t) => t.branchBase))];
  if (bases.length > 1) {
    problem('branch-base', group.map((t) => t.slug), `branch ${group[0].branch} carries ${bases.length} branch-base values: ${bases.map((b) => b || '(empty)').join(', ')}`);
  }
}

// A merge-after entry names a branch of the task's own repository, or `<repository path>:<branch>`
// for another one; git forbids `:` in a branch name, so the last colon is the split.
const branchKey = (repository, branch) => `${path.resolve(repository)}\0${branch}`;
const refOf = (t, entry) => {
  const i = entry.lastIndexOf(':');
  return entry.startsWith('/') && i > 0 ? { repository: entry.slice(0, i), branch: entry.slice(i + 1) } : { repository: t.repository, branch: entry };
};
const byBranch = new Map([...branches.values()].map((g) => [branchKey(g[0].repository, g[0].branch), g]));
for (const group of byBranch.values()) {
  const values = [...new Set(group.map((t) => JSON.stringify([...t.mergeAfter].sort())))];
  if (values.length > 1) {
    problem('merge-after', group.map((t) => t.slug), `branch ${group[0].branch} carries ${values.length} merge-after values`);
  }
  for (const entry of new Set(group.flatMap((t) => t.mergeAfter))) {
    const ref = refOf(group[0], entry);
    const key = branchKey(ref.repository, ref.branch);
    if (key === branchKey(group[0].repository, group[0].branch)) problem('merge-after', group.map((t) => t.slug), `branch ${group[0].branch} names itself in merge-after`);
    else if (!byBranch.has(key)) problem('merge-after', group.map((t) => t.slug), `merge-after "${entry}" on branch ${group[0].branch} names a branch no task builds`);
  }
}

// What each branch's pull request must merge after: its stack base, the branches its tasks' edges
// point at, and its merge-after holds — each followed transitively.
const directlyAfter = new Map();
for (const [key, group] of byBranch) {
  const after = new Set();
  const base = group[0].branchBase && branchKey(group[0].repository, group[0].branchBase);
  if (base && byBranch.has(base)) after.add(base);
  for (const t of group) {
    for (const d of t.dependsOn) {
      const dep = bySlug.get(d);
      if (dep && dep.repository !== 'none' && dep.branch) after.add(branchKey(dep.repository, dep.branch));
    }
    for (const entry of t.mergeAfter) {
      const ref = refOf(t, entry);
      after.add(branchKey(ref.repository, ref.branch));
    }
  }
  after.delete(key);
  directlyAfter.set(key, [...after].filter((k) => byBranch.has(k)));
}
const landing = [];
{
  const state = new Map();
  const closure = new Map();
  const stack = [];
  const visit = (key) => {
    state.set(key, 'open');
    stack.push(key);
    const all = new Set();
    for (const k of directlyAfter.get(key)) {
      if (state.get(k) === 'open') {
        const cycle = stack.slice(stack.indexOf(k));
        problem('merge-after', cycle.flatMap((c) => byBranch.get(c).map((t) => t.slug)), `landing cycle: ${[...cycle, k].map((c) => byBranch.get(c)[0].branch).join(' -> ')}`);
        continue;
      }
      if (!state.has(k)) visit(k);
      all.add(k);
      for (const x of closure.get(k) || []) all.add(x);
    }
    stack.pop();
    state.set(key, 'closed');
    closure.set(key, all);
    const g = byBranch.get(key);
    landing.push({
      repository: g[0].repository,
      branch: g[0].branch,
      after: [...all].map((k) => ({ repository: byBranch.get(k)[0].repository, branch: byBranch.get(k)[0].branch })),
    });
  };
  for (const key of byBranch.keys()) if (!state.has(key)) visit(key);
}

for (const t of tasks) {
  if (t.repository === 'none') continue;
  if (!t.repository || !path.isAbsolute(t.repository) || !fs.existsSync(t.repository) || !fs.statSync(t.repository).isDirectory()) {
    problem('repository', [t.slug], `repository "${t.repository}" is not an existing absolute directory`);
  }
}

const specPaths = [...new Set(tasks.filter((t) => t.spec).map((t) => path.resolve(path.dirname(t.file), t.spec)))].map((p) => ({ path: p, exists: fs.existsSync(p) }));
const noSpec = tasks.filter((t) => !t.spec).map((t) => t.slug);
if (noSpec.length) problem('spec', noSpec, 'no spec: pointer');
if (specPaths.length > 1) problem('spec', tasks.map((t) => t.slug), `tasks point at ${specPaths.length} different spec files`);
for (const s of specPaths) if (!s.exists) problem('spec', tasks.filter((t) => path.resolve(path.dirname(t.file), t.spec) === s.path).map((t) => t.slug), `spec ${s.path} does not exist`);

const launch = tasks.map((t) => ({
  slug: t.slug,
  file: t.file,
  name: t.name,
  repository: t.repository,
  branch: t.branch,
  baseBranch: t.branchBase || null,
  phase: t.phase,
  dependsOn: t.dependsOn,
  status: t.status,
}));

process.stdout.write(`${JSON.stringify({ dir, specPaths, tasks, launch, landing, problems })}\n`);
process.exit(problems.length ? 2 : 0);

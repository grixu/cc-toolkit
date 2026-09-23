// Presence only: branch-base is legitimately empty on a root task and on an operational one.
export const REQUIRED_FM_KEYS = [
  'name', 'status', 'spec', 'elements', 'decisions', 'repository', 'branch',
  'branch-base', 'worktree', 'phase', 'depends-on', 'tickets',
];

export const ELEMENT_CODES = ['DB-1', 'API-1', 'API-2', 'UI-1', 'CONFIG-1', 'INTEGRATION-1'];

// Element → owner-subtree map from the fixture's ownership table; no task may mix groups.
const OWNER_GROUPS = [
  ['DB-1', 'API-2'],           // repo-a services/ledger (team-ledger)
  ['API-1', 'CONFIG-1'],       // repo-a services/checkout (team-checkout)
  ['UI-1', 'INTEGRATION-1'],   // repo-b (team-web)
];

const PHASE_2_ELEMENTS = ['CONFIG-1', 'INTEGRATION-1'];

export const SENTINELS = [
  'amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0)',
  'repo-a/services/ledger/src/api/entries.ts:7-10',
  'repo-a/services/checkout/src/api/charge.ts:6-8',
];

export function elementsOf(task) {
  const e = task.fm && task.fm.elements;
  return Array.isArray(e) ? e : typeof e === 'string' && e ? [e] : [];
}

// The structural asserts split-baseline and split-english-artifacts share for a task set
// split from the rollout spec.
export function checkTaskStructure(c, tasks) {
  for (const t of tasks) {
    c.check(/^\d{4}-.+\.md$/.test(t.file), `${t.file}: filename is not <NNNN>-<slug>.md (zero-padded reading-order ordinal)`);
    c.check(t.fm !== null, `${t.file}: no YAML frontmatter`);
    if (!t.fm) continue;
    for (const key of REQUIRED_FM_KEYS) {
      c.check(key in t.fm, `${t.file}: frontmatter is missing ${key}`);
    }
    c.check(t.fm.status === 'todo', `${t.file}: status is not todo`);
    c.check(t.fm.worktree === '' || t.fm.worktree === undefined || t.fm.worktree === null, `${t.file}: worktree is not empty at split time`);
    if (t.fm.repository === 'none') {
      // Operational task: no pull request, so branch stays empty and the body says why.
      c.check(!t.fm.branch, `${t.file}: operational task (repository: none) must leave branch empty`);
      c.check(/## Note/.test(t.body), `${t.file}: operational task body does not close with a ## Note saying why no pull request exists`);
    } else {
      c.check(typeof t.fm.branch === 'string' && t.fm.branch.length > 0, `${t.file}: branch is empty`);
    }
    c.check(typeof t.fm.repository === 'string' && t.fm.repository.length > 0 && !/,| and /.test(t.fm.repository), `${t.file}: repository is not a single value`);
    c.check(/## Goal/.test(t.body), `${t.file}: body has no ## Goal`);
    c.check(/## Done when/.test(t.body), `${t.file}: body has no ## Done when`);
    c.check(/## Where to look/.test(t.body), `${t.file}: body has no ## Where to look`);
  }
}

export function checkIndexCardRule(c, tasks) {
  for (const t of tasks) {
    for (const s of SENTINELS) {
      c.check(!t.body.includes(s), `${t.file}: sentinel contract prose copied from the spec ("${s.slice(0, 40)}…")`);
    }
    c.check(!/[\w./-]+\.(ts|tsx|sql)\s*:\d+/.test(t.body), `${t.file}: body carries a path:line reference (pointers go by element code and section heading)`);
  }
}

export function checkCoverage(c, tasks, codes = ELEMENT_CODES) {
  const all = tasks.flatMap(elementsOf);
  const counts = new Map();
  for (const e of all) counts.set(e, (counts.get(e) || 0) + 1);
  for (const code of codes) {
    c.check(counts.get(code) === 1, `element ${code} appears in ${counts.get(code) || 0} tasks (must be exactly 1)`);
  }
  for (const e of counts.keys()) {
    c.check(codes.includes(e), `unknown element code ${e} in a task`);
  }
}

// `precedesDb` names the one element a fixture's build order puts ahead of the migration; without
// it DB-1 is the root and any edge onto it is one the data does not require.
export function checkBoundaries(c, tasks, { precedesDb = null } = {}) {
  for (const t of tasks) {
    const els = elementsOf(t);
    const groupsHit = OWNER_GROUPS.filter((g) => els.some((e) => g.includes(e))).length;
    c.check(groupsHit <= 1, `${t.file}: mixes elements across repository/ownership boundaries (${els.join(', ')})`);
  }
  const migration = tasks.find((t) => elementsOf(t).includes('DB-1'));
  if (c.check(migration !== undefined, 'no task carries DB-1')) {
    c.check(elementsOf(migration).length === 1, 'the DB-1 migration does not have its own task');
    const deps = migration.fm['depends-on'] || [];
    if (precedesDb === null) {
      c.check(deps.length === 0, 'the DB-1 migration task has a depends-on edge its data does not require');
    } else {
      const predecessor = tasks.find((t) => elementsOf(t).includes(precedesDb));
      const allowed = predecessor ? [predecessor.slug, predecessor.fm && predecessor.fm.name] : [];
      c.check(deps.length === 1, `the DB-1 migration task carries ${deps.length} edges; the build order puts only ${precedesDb} ahead of it`);
      c.check(
        deps.every((d) => allowed.includes(String(d))),
        `the DB-1 migration task depends on ${deps.join(', ')} instead of the ${precedesDb} task`,
      );
    }
  }
  const slugs = new Set(tasks.flatMap((t) => [t.slug, t.file.replace(/\.md$/, ''), t.fm && t.fm.name].filter(Boolean)));
  for (const t of tasks) {
    const els = elementsOf(t);
    const isPhase2 = els.some((e) => PHASE_2_ELEMENTS.includes(e));
    const deps = (t.fm && t.fm['depends-on']) || [];
    if (isPhase2) {
      c.check(/2/.test(String(t.fm.phase)), `${t.file}: phase-2 element in a task whose phase is ${t.fm.phase}`);
      c.check(Array.isArray(deps) && deps.length > 0, `${t.file}: phase-2 task has no depends-on edge`);
    }
    for (const d of Array.isArray(deps) ? deps : []) {
      c.check(!/^\d{4}-/.test(String(d)), `${t.file}: depends-on "${d}" carries the filename ordinal — edges must use the bare slug`);
      c.check(slugs.has(String(d)) || slugs.has(String(d).replace(/\.md$/, '')), `${t.file}: depends-on "${d}" names no existing task`);
    }
  }
}

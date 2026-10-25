import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'task-graph.mjs')

// Two repositories: repo-a stacks api on db, repo-b carries a panel; the phase-2 flag in repo-a stacks
// on api and is held behind repo-b's panel by merge-after alone.
const layout = (over = () => ({})) => {
  const root = mkdtempSync(join(tmpdir(), 'task-graph-'))
  const a = join(root, 'repo-a')
  const b = join(root, 'repo-b')
  mkdirSync(a)
  mkdirSync(b)
  const tasks = join(root, 'spec', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(root, 'spec', 'spec.md'), '# spec\n')
  const files = {
    '0001-db': { repository: a, branch: 'feat/db', base: 'main', phase: 1 },
    '0002-api': { repository: a, branch: 'feat/api', base: 'feat/db', phase: 1, deps: ['db'] },
    '0003-panel': { repository: b, branch: 'feat/panel', base: 'main', phase: 1 },
    '0004-flag': { repository: a, branch: 'feat/flag', base: 'feat/api', phase: 2, mergeAfter: [`${b}:feat/panel`] },
    ...over({ a, b }),
  }
  for (const [name, f] of Object.entries(files)) {
    if (f === null) continue
    const fm = [
      `name: ${name}`,
      'status: todo',
      'spec: ../spec.md',
      'elements: []',
      'decisions: []',
      `repository: ${f.repository}`,
      `branch: ${f.branch}`,
      `branch-base: ${f.base}`,
      ...(f.mergeAfter === undefined ? [] : [`merge-after: [${f.mergeAfter.join(', ')}]`]),
      'worktree:',
      `phase: ${f.phase}`,
      `depends-on: [${(f.deps || []).join(', ')}]`,
      'tickets: []',
    ]
    writeFileSync(join(tasks, `${name}.md`), `---\n${fm.join('\n')}\n---\n\n## Goal\n`)
  }
  return { tasks, a, b }
}

const run = (dir) => {
  try {
    return { code: 0, out: JSON.parse(execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' })) }
  } catch (err) {
    return { code: err.status, out: JSON.parse(err.stdout) }
  }
}

const after = (out, branch) => out.landing.find((l) => l.branch === branch).after.map((x) => x.branch).sort()

test('merge-after parses as a list and an absent field reads as empty', () => {
  const { tasks, b } = layout()
  const { code, out } = run(tasks)
  assert.equal(code, 0, JSON.stringify(out.problems))
  assert.deepEqual(out.tasks.find((t) => t.slug === 'flag').mergeAfter, [`${b}:feat/panel`])
  assert.deepEqual(out.tasks.find((t) => t.slug === 'db').mergeAfter, [])
})

test('landing follows stack bases, edges and merge-after transitively, across repositories', () => {
  const { tasks } = layout()
  const { out } = run(tasks)
  assert.deepEqual(after(out, 'feat/flag'), ['feat/api', 'feat/db', 'feat/panel'])
  assert.deepEqual(after(out, 'feat/api'), ['feat/db'])
  assert.deepEqual(after(out, 'feat/panel'), [])
  const order = out.landing.map((l) => l.branch)
  for (const l of out.landing) for (const x of l.after) assert.ok(order.indexOf(x.branch) < order.indexOf(l.branch), `${l.branch} listed before ${x.branch}`)
})

test('a bare merge-after entry names a branch of the same repository', () => {
  const { tasks } = layout(({ a }) => ({ '0003-panel': { repository: a, branch: 'feat/panel', base: 'main', phase: 1 }, '0004-flag': { repository: a, branch: 'feat/flag', base: 'main', phase: 2, mergeAfter: ['feat/panel', 'feat/api'] } }))
  const { code, out } = run(tasks)
  assert.equal(code, 0, JSON.stringify(out.problems))
  assert.deepEqual(after(out, 'feat/flag'), ['feat/api', 'feat/db', 'feat/panel'])
})

test('merge-after naming a branch no task builds is a problem', () => {
  const { tasks } = layout(({ a }) => ({ '0004-flag': { repository: a, branch: 'feat/flag', base: 'feat/api', phase: 2, mergeAfter: ['feat/nowhere'] } }))
  const { code, out } = run(tasks)
  assert.equal(code, 2)
  assert.deepEqual(out.problems.map((p) => p.kind), ['merge-after'])
  assert.match(out.problems[0].detail, /feat\/nowhere.*names a branch no task builds/)
})

test('two merge-after values on one branch are a problem', () => {
  const { tasks } = layout(({ a, b }) => ({
    '0005-flag-docs': { repository: a, branch: 'feat/flag', base: 'feat/api', phase: 2, mergeAfter: [] },
    '0004-flag': { repository: a, branch: 'feat/flag', base: 'feat/api', phase: 2, mergeAfter: [`${b}:feat/panel`] },
  }))
  const { out } = run(tasks)
  assert.ok(out.problems.some((p) => p.kind === 'merge-after' && /2 merge-after values/.test(p.detail)), JSON.stringify(out.problems))
})

test('a merge-after hold that closes a loop is a landing cycle', () => {
  const { tasks } = layout(({ a }) => ({ '0001-db': { repository: a, branch: 'feat/db', base: 'main', phase: 1, mergeAfter: ['feat/flag'] } }))
  const { out } = run(tasks)
  assert.ok(out.problems.some((p) => p.kind === 'merge-after' && /landing cycle/.test(p.detail)), JSON.stringify(out.problems))
})

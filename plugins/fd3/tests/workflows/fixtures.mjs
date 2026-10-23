export const REPO = '/r/app'
export const SPEC = '/r/app/docs/spec.md'
export const TOOLCHAIN = '## Commands\n1. pnpm typecheck (scoped: pnpm tsc -p <paths>)\n2. pnpm test (scoped: pnpm vitest run <paths>)'
export const BASELINE = { commands: [{ command: 'pnpm typecheck', passed: false, failures: ['src/old.ts:1 TS2322'] }, { command: 'pnpm test', passed: true }], dirty: ['.cache/tsbuildinfo'] }

export const tag = (branch, repo = REPO) => `${repo.split('/').pop()}:${branch.replace(/\//g, '-')}`
export const worktree = (branch, repo = REPO) => `${repo}.worktrees/${branch.replace(/\//g, '-')}`

export const task = (slug, over = {}) => ({
  slug,
  file: `${REPO}/tasks/${slug}.md`,
  name: `Task ${slug}`,
  repository: REPO,
  branch: 'feat/x',
  baseBranch: null,
  phase: 1,
  dependsOn: [],
  status: 'todo',
  ...over,
})

export const implementArgs = (over = {}) => ({
  specPath: SPEC,
  tasks: [task('t1'), task('t2', { dependsOn: ['t1'] })],
  repos: { [REPO]: { startRef: 'origin/main', diffBase: 'origin/main' } },
  review: true,
  maxFixRounds: 2,
  ...over,
})

export const finding = (over = {}) => ({ severity: 'high', family: 'simplicity', rule: 'dead-code', location: 'src/a.ts:L3', risk: 'safe', fix: 'remove it', ...over })

// The scripts' own review-finding line, so a test can look a finding up in a prompt or a HIL reason.
export const line = (f) => `${f.location} — ${f.family} · ${f.rule} (${f.severity}): ${f.fix}`

// The commit every CI runner reports grading; fixers in the defaults report a different toSha, so a
// fix round always moves HEAD past it.
export const HEAD = 'head000'

export const ciPass =(prompt, opts) => {
  const branch = /branch "([^"]+)"/.exec(prompt)[1]
  return { passed: true, failures: [], preExisting: ['src/old.ts:1 TS2322'], branch, dirty: '', head: HEAD, marked: /set `status: done`/.test(prompt) }
}
export const ciFail = (failures) => (prompt) => ({ ...ciPass(prompt), passed: false, failures, marked: false })

// Every merge of a wave reports exactly the tasks it was asked for, grouped by target, read off the
// prompt's plan so a scenario never repeats the graph.
export const mergeAll = (prompt) => {
  const branches = []
  let current = null
  for (const l of prompt.split('\n')) {
    const target = /^- target (\S+) \(stacks on .*, worktree (.+?)(?: — the main checkout)?\):$/.exec(l)
    if (target) {
      current = { branch: target[1], worktree: target[2], mergedSlugs: [], conflicts: [] }
      branches.push(current)
      continue
    }
    const t = /^ {4}- task\/\S+ \(task (\S+), file/.exec(l)
    if (t && current) current.mergedSlugs.push(t[1])
  }
  return { branches }
}

export const implemented = (prompt) => ({ slug: /Return slug "([^"]+)"/.exec(prompt)[1], outcome: 'implemented', summary: 'did it' })

export const prepReady = (active = ['simplicity', 'security', 'spec']) => ({ status: 'ready', invoked: true, files: 2, skipped: 0, active })
export const scanned = { status: 'scanned', invoked: true, filesJudged: 2, filesTotal: 2 }
export const crMerged = (findings = []) => ({ status: 'merged', invoked: true, report: '/tmp/cr-report.md', findings })

// The defaults answer every label a clean implement-run produces; a test puts its own rules first.
export const implementDefaults = () => [
  ['scout:', TOOLCHAIN],
  ['baseline:', BASELINE],
  [/^wave\d+:/, implemented],
  [/^merge\d*:/, mergeAll],
  ['mark-blocked', 'ok'],
  ['toolchain-touch:', { touched: false }],
  ['refresh:', { refreshed: true }],
  [/^ci:/, ciPass],
  [/^cr-prep:.*:delta$/, prepReady(['simplicity'])],
  ['cr-prep:', prepReady()],
  ['cr:', scanned],
  ['cr-merge:', crMerged()],
  [/^fix-/, { summary: 'fixed', fromSha: 'aaa111', toSha: 'bbb222', skipped: [] }],
  ['unmark:', 'ok'],
  ['mark:', { marked: true }],
]

export const repair = (branch, over = {}) => ({
  repo: REPO,
  branch,
  worktree: worktree(branch),
  base: 'origin/main',
  instructions: [`rename foo to bar on ${branch}`],
  taskFiles: [`${REPO}/tasks/${branch.replace(/\//g, '-')}.md`],
  ...over,
})

export const repairArgs = (over = {}) => ({
  repairs: [repair('feat/x')],
  repos: { [REPO]: { startRef: 'origin/main', diffBase: 'origin/main' } },
  review: true,
  specPath: SPEC,
  toolchain: { [REPO]: TOOLCHAIN },
  baseline: { [REPO]: BASELINE },
  maxFixRounds: 2,
  ...over,
})

export const repairDefaults = () => [
  ['scout:', TOOLCHAIN],
  ['baseline:', BASELINE],
  ['repair:', { outcome: 'repaired', summary: 'renamed', fromSha: 'rep000' }],
  ['refresh:', { refreshed: true }],
  ['toolchain-touch:', { touched: false }],
  [/^ci:/, ciPass],
  ['cr-prep:', prepReady()],
  ['cr:', scanned],
  ['cr-merge:', crMerged()],
  ['fix-ci:', { summary: 'fixed', fromSha: 'aaa111', toSha: 'bbb222' }],
  ['unmark:', 'ok'],
  ['mark:', { marked: true }],
]

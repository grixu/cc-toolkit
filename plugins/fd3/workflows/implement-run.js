export const meta = {
  name: 'implement-run',
  description: 'Implement spec tasks in dependency-ordered waves, merging each wave into its target branch, then validate each branch once',
  whenToUse: 'Launched by the fd3:implement-tasks skill with a parsed task graph; not meant to be invoked bare.',
  phases: [
    { title: 'Recon', detail: 'toolchain detection, one scout per repository' },
    { title: 'Implement', detail: 'parallel waves gated by the depends-on graph, each wave merged into its target branch' },
    { title: 'Validate', detail: 'CI then code review, one branch at a time' },
  ],
}

// args, provided by the fd3:implement-tasks skill (the script has no filesystem access):
//   tasksDir      absolute path of the task files directory
//   specPath      absolute path of the specification file the tasks point into
//   tasks         [{ slug, file, name, repository, branch, baseBranch, phase, dependsOn, status }]
//                 repository is an absolute path, or 'none' for an operational task; baseBranch is
//                 the branch this task's target branch stacks on, or null for the repository's
//                 default branch; status is one of todo | implemented | blocked | done (stale
//                 in-progress is reset by the skill before launch)
//   reviewSkills  code-review skill names to run during validation, may be empty
//   maxFixRounds  CI fix attempts per branch before giving up

// args can arrive JSON-encoded depending on the caller; normalize before destructuring
const input = typeof args === 'string' ? JSON.parse(args) : args
const { tasksDir, specPath, tasks, reviewSkills, maxFixRounds } = input

const status = new Map(tasks.map((t) => [t.slug, t.status]))
// Whether a task's branch reached its target is git's knowledge, never a task-file field: the
// merge rounds re-list every implemented task and an already-merged branch no-ops, so a run
// interrupted between implementation and merge resumes correctly for free.
const merged = new Set()
const conflicted = new Set() // merge gave up on these; never retried within this run
const hil = [] // everything that needs a human: operational tasks, blockers, conflicts, unfixable CI
const taskBranch = (t) => `task/${t.slug}`
// Worktrees live beside the repository, never inside it, so validation tooling cannot pick them up.
const worktreePath = (repo, name) => `${repo}.worktrees/${name.replace(/\//g, '-')}`
const byRepo = (list) => {
  const groups = new Map()
  for (const t of list) {
    if (!groups.has(t.repository)) groups.set(t.repository, [])
    groups.get(t.repository).push(t)
  }
  return groups
}

// ---- Recon: detect each repository's validation toolchain (kept in memory for this run only)

phase('Recon')

const repositories = [...new Set(tasks.filter((t) => t.repository !== 'none').map((t) => t.repository))]

const toolchainReports = await parallel(
  repositories.map((repo) => () =>
    agent(
      `Repository to analyse: ${repo}\n` +
        `Detect how this repository is validated and return your full report.`,
      { agentType: 'fd3:toolchain-scout', label: `scout:${repo.split('/').pop()}`, phase: 'Recon' },
    ),
  ),
)
const toolchain = new Map(repositories.map((repo, i) => [repo, toolchainReports[i]]))

// ---- Implement: waves of parallel tasks gated by depends-on, each wave merged before the next

phase('Implement')

// Operational tasks are human work by definition; they and pre-existing blocked tasks go
// straight to the HIL list and gate their dependents.
for (const t of tasks) {
  if (t.repository === 'none' && status.get(t.slug) !== 'done') {
    status.set(t.slug, 'blocked')
    hil.push({ slug: t.slug, kind: 'operational', reason: 'Manual work against the live system; no repository carries it.' })
  } else if (status.get(t.slug) === 'blocked') {
    hil.push({ slug: t.slug, kind: 'carried-over', reason: 'Already blocked before this run.' })
  }
}

const IMPLEMENT_RESULT = {
  type: 'object',
  required: ['slug', 'outcome', 'summary'],
  properties: {
    slug: { type: 'string' },
    outcome: { enum: ['implemented', 'blocked'] },
    summary: { type: 'string' },
    reason: { type: 'string', description: 'why the task is blocked; only when outcome is blocked' },
  },
}

const implementPrompt = (task) => {
  return [
    `Implement one task of a specification. Task file: ${task.file}`,
    ``,
    `1. Read the task file. The specification is at ${specPath}; read only the spec sections`,
    `   the task's "Where to look" pointers name, plus the decisions it cites. Never read the`,
    `   whole spec.`,
    `2. In the task file set \`status: in-progress\` and \`worktree: ${worktreePath(task.repository, taskBranch(task))}\`.`,
    `3. In the repository ${task.repository}, create that worktree on a new branch ${taskBranch(task)}`,
    `   (git worktree add <path> -b <branch> <start-point>). Start it from ${task.branch} if that`,
    `   branch exists, otherwise from ${task.baseBranch || "the repository's default branch"} —`,
    `   everything this task depends on is already merged there.`,
    `4. Implement exactly what the task's Goal and Done-when describe — nothing more. Work only`,
    `   inside your worktree; the only file you touch outside it is the task file itself.`,
    `5. Do not run linters, test suites or builds — validation is batched later for the whole`,
    `   branch. Commit with a conventional-commit message citing the task's tickets, if any.`,
    `6. On success set \`status: implemented\` in the task file.`,
    ``,
    `If the task requires an action you must not take — a production mutation, secrets, an`,
    `irreversible step — or a decision the task and spec do not settle, stop: set`,
    `\`status: blocked\`, append a \`## Blocked\` section to the task body stating why, and return`,
    `outcome "blocked" with that reason. Never guess your way past a blocker.`,
    ``,
    `Return slug "${task.slug}", the outcome, and a two-sentence summary of what you changed.`,
  ].join('\n')
}

const MERGE_RESULT = {
  type: 'object',
  required: ['branches'],
  properties: {
    branches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['branch', 'worktree', 'mergedSlugs', 'conflicts'],
        properties: {
          branch: { type: 'string' },
          worktree: { type: 'string' },
          mergedSlugs: { type: 'array', items: { type: 'string' }, description: 'slugs of the tasks whose branches are now in this target, including ones that already were' },
          conflicts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['slug', 'description'],
              properties: { slug: { type: 'string' }, description: { type: 'string' } },
            },
            description: 'tasks whose merge was aborted on a judgment conflict',
          },
        },
      },
    },
  },
}

const mergePrompt = (repo, repoTasks) => {
  // repoTasks arrive in the tasks array's ordinal order, which is topological — so targets of
  // earlier landing units are listed, and worked, before the branches that stack on them.
  const targets = new Map()
  for (const t of repoTasks) {
    if (!targets.has(t.branch)) targets.set(t.branch, { base: t.baseBranch, tasks: [] })
    targets.get(t.branch).tasks.push(t)
  }
  const plan = [...targets.entries()]
    .map(
      ([branch, g]) =>
        `- target ${branch} (stacks on ${g.base || 'the default branch'}, worktree ${worktreePath(repo, branch)}):\n` +
        g.tasks.map((t) => `    - ${taskBranch(t)} (task ${t.slug})`).join('\n'),
    )
    .join('\n')
  return [
    `Merge implemented task branches in the repository ${repo} into their target branches.`,
    ``,
    `Work the targets in the listed order — later targets stack on earlier ones:`,
    plan,
    ``,
    `For each target branch, in order:`,
    `1. If the branch does not exist, create it from its stack base. If its worktree directory is`,
    `   missing, create it (replace "/" with "-" in the branch name to form the directory name).`,
    `2. Merge the stack base into the target first, so the stack stays current.`,
    `3. Merge the listed task branches into it, in the listed order. A branch that answers`,
    `   "Already up to date" is expected on a resumed run — count its task as merged.`,
    ``,
    `Resolve a merge conflict only when the two sides are clearly compatible and the resolution`,
    `is mechanical; commit the resolution. When a conflict needs a judgment call, abort that`,
    `merge (git merge --abort), record the task under conflicts, and continue with the rest.`,
    ``,
    `Return every target branch you touched with its worktree path, the slugs of the tasks now`,
    `merged in, and the conflicts (empty array when clean).`,
  ].join('\n')
}

const units = [] // { repo, branch, worktree, tasks } — the units validation runs on, in merge order
const recordUnit = (repo, b, slugs) => {
  let unit = units.find((u) => u.repo === repo && u.branch === b.branch)
  if (!unit) {
    unit = { repo, branch: b.branch, worktree: b.worktree, tasks: [] }
    units.push(unit)
  }
  for (const slug of slugs) if (!unit.tasks.includes(slug)) unit.tasks.push(slug)
}

let wave = 0
while (true) {
  // A dependency counts as satisfied only once its branch is in the target — done tasks
  // passed validation on a merged branch, implemented ones must have cleared a merge round.
  const ready = tasks.filter(
    (t) =>
      status.get(t.slug) === 'todo' &&
      t.dependsOn.every((dep) => status.get(dep) === 'done' || merged.has(dep)),
  )

  if (ready.length > 0) {
    wave += 1
    log(`Wave ${wave}: ${ready.map((t) => t.slug).join(', ')}`)

    const results = await parallel(
      ready.map((task) => () =>
        agent(implementPrompt(task), {
          label: `wave${wave}:${task.slug}`,
          phase: 'Implement',
          schema: IMPLEMENT_RESULT,
        }),
      ),
    )

    ready.forEach((task, i) => {
      const result = results[i]
      if (result && result.outcome === 'implemented') {
        status.set(task.slug, 'implemented')
      } else {
        status.set(task.slug, 'blocked')
        hil.push({
          slug: task.slug,
          kind: 'implementation',
          reason: result ? result.reason || result.summary : 'The implementation agent died without a result.',
        })
      }
    })
  }

  // Merge round: everything implemented and not yet in its target — including tasks an earlier,
  // interrupted run implemented, whose merge state only git knows.
  const toMerge = tasks.filter(
    (t) => status.get(t.slug) === 'implemented' && !merged.has(t.slug) && !conflicted.has(t.slug),
  )
  if (ready.length === 0 && toMerge.length === 0) break

  if (toMerge.length > 0) {
    const groups = byRepo(toMerge)
    const mergeReports = await parallel(
      [...groups.entries()].map(([repo, repoTasks]) => () =>
        agent(mergePrompt(repo, repoTasks), {
          label: `merge${wave ? wave : ''}:${repo.split('/').pop()}`,
          phase: 'Implement',
          schema: MERGE_RESULT,
        }),
      ),
    )
    ;[...groups.entries()].forEach(([repo, repoTasks], i) => {
      const report = mergeReports[i]
      if (!report) {
        repoTasks.forEach((t) => conflicted.add(t.slug))
        hil.push({ slug: null, kind: 'merge', reason: `The merge agent for ${repo} died without a result.` })
        return
      }
      for (const b of report.branches) {
        for (const slug of b.mergedSlugs) merged.add(slug)
        for (const c of b.conflicts) {
          conflicted.add(c.slug)
          hil.push({ slug: c.slug, kind: 'merge-conflict', reason: `${repo} ${b.branch}: ${c.description}` })
        }
        recordUnit(repo, b, b.mergedSlugs)
      }
      // A task the agent left without a verdict would re-enter this round forever; treat it as a
      // conflict so the run ends and the human sees it.
      for (const t of repoTasks) {
        if (!merged.has(t.slug) && !conflicted.has(t.slug)) {
          conflicted.add(t.slug)
          hil.push({ slug: t.slug, kind: 'merge', reason: `The merge agent for ${repo} returned no verdict for this task.` })
        }
      }
    })
  }
}

// Tasks still todo here sit behind a blocked or conflicted dependency; the human unblocks,
// the skill relaunches.
const unreachable = tasks.filter((t) => status.get(t.slug) === 'todo').map((t) => t.slug)

// ---- Validate: one branch at a time, so at most one build/lint/test pipeline runs at once

phase('Validate')

const CI_RESULT = {
  type: 'object',
  required: ['passed', 'failures'],
  properties: {
    passed: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' }, description: 'one entry per failing command, with the load-bearing output lines' },
  },
}

const CR_RESULT = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: { type: 'array', items: { type: 'string' }, description: 'one entry per finding worth fixing: file, problem, why' },
  },
}

const ciPrompt = (unit) =>
  [
    `Run the validation commands for the repository ${unit.repo}, branch ${unit.branch},`,
    `in the worktree ${unit.worktree}. Run them in the reported order, sequentially — never in`,
    `parallel. Toolchain report for this repository:`,
    ``,
    toolchain.get(unit.repo),
    ``,
    `Skip everything the report lists as not runnable here. Do not fix anything.`,
    `Return passed=true only when every runnable command exits 0; otherwise return each failing`,
    `command with the output lines that matter.`,
  ].join('\n')

const fixPrompt = (unit, problems, source) =>
  [
    `Fix ${source} problems on branch ${unit.branch} in the worktree ${unit.worktree}`,
    `(repository ${unit.repo}). Problems:`,
    ``,
    ...problems.map((p) => `- ${p}`),
    ``,
    `Fix only what is listed — no refactoring, no drive-by changes. Commit the fixes with a`,
    `conventional-commit message. Do not run the full validation suite; it is rerun after you.`,
  ].join('\n')

const reviewPrompt = (unit, skillName) =>
  [
    `In the worktree ${unit.worktree} (repository ${unit.repo}), review the branch ${unit.branch}:`,
    `invoke the \`${skillName}\` skill via the Skill tool on the diff between this branch and the`,
    `repository's default branch. Report, do not fix.`,
    ``,
    `Return only the findings worth fixing, one entry each: file, the problem, and why it matters.`,
    `An empty findings array is a valid result.`,
  ].join('\n')

const validation = [] // per-branch summary for the final report

for (const unit of units) {
  const repoName = unit.repo.split('/').pop()
  const summary = { repo: unit.repo, branch: unit.branch, ci: 'pending', fixRounds: 0, reviewFindings: 0 }
  validation.push(summary)

  let ci = await agent(ciPrompt(unit), { label: `ci:${repoName}`, phase: 'Validate', schema: CI_RESULT })
  while (ci && !ci.passed && summary.fixRounds < maxFixRounds) {
    summary.fixRounds += 1
    await agent(fixPrompt(unit, ci.failures, 'CI'), { label: `fix-ci:${repoName}#${summary.fixRounds}`, phase: 'Validate' })
    ci = await agent(ciPrompt(unit), { label: `ci:${repoName}#${summary.fixRounds + 1}`, phase: 'Validate', schema: CI_RESULT })
  }
  if (!ci || !ci.passed) {
    summary.ci = 'failed'
    hil.push({
      slug: null,
      kind: 'ci',
      reason: `${unit.repo} ${unit.branch}: CI still failing after ${maxFixRounds} fix rounds: ${ci ? ci.failures.join('; ') : 'CI agent died'}`,
    })
    continue
  }
  summary.ci = 'passed'

  // Review skills are read-only lenses; they can run in parallel — unlike CI they hog no cores.
  if (reviewSkills.length > 0) {
    const reviews = await parallel(
      reviewSkills.map((skillName) => () =>
        agent(reviewPrompt(unit, skillName), { label: `cr:${skillName}:${repoName}`, phase: 'Validate', schema: CR_RESULT }),
      ),
    )
    const findings = reviews.filter(Boolean).flatMap((r) => r.findings)
    summary.reviewFindings = findings.length
    if (findings.length > 0) {
      await agent(fixPrompt(unit, findings, 'code-review'), { label: `fix-cr:${repoName}`, phase: 'Validate' })
      const finalCi = await agent(ciPrompt(unit), { label: `ci:${repoName}:final`, phase: 'Validate', schema: CI_RESULT })
      if (!finalCi || !finalCi.passed) {
        summary.ci = 'failed-after-review-fixes'
        hil.push({
          slug: null,
          kind: 'ci',
          reason: `${unit.repo} ${unit.branch}: review fixes broke CI: ${finalCi ? finalCi.failures.join('; ') : 'CI agent died'}`,
        })
        continue
      }
    }
  }

  await agent(
    `In ${tasksDir}, set \`status: done\` in the frontmatter of these task files, changing nothing else:\n` +
      unit.tasks.map((slug) => `- ${tasks.find((t) => t.slug === slug).file}`).join('\n'),
    { label: `done:${repoName}`, phase: 'Validate', effort: 'low' },
  )
  unit.tasks.forEach((slug) => status.set(slug, 'done'))
}

return {
  tasks: tasks.map((t) => ({ slug: t.slug, status: status.get(t.slug) })),
  branches: validation,
  hil,
  unreachable,
}

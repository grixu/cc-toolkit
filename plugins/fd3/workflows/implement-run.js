export const meta = {
  name: 'implement-run',
  description: 'Implement spec tasks in dependency-ordered waves, merging each wave into its target branch, then validate each branch once',
  whenToUse: 'Launched by the fd3:implement-tasks skill with a parsed task graph; not meant to be invoked bare.',
  phases: [
    { title: 'Recon', detail: 'toolchain detection and a baseline run per repository' },
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
//                 base ref; status is one of todo | implemented | blocked | done (stale
//                 in-progress is reset by the skill before launch)
//   repos         { [repository path]: { defaultRef, parkedBranch } } — defaultRef is the ref new
//                 branches are cut from (e.g. "origin/main"); the skill fetches before launch, so
//                 origin/* is fresh. parkedBranch (optional) names the target branch checked out
//                 in the main repository itself — git refuses a second worktree for it, so the
//                 main checkout serves as that branch's worktree
//   reviewSkills  code-review skill names to run during validation, may be empty
//   maxFixRounds  CI fix attempts per branch before giving up
//   toolchain     (optional) { [repository path]: <scout report> } from a previous run's report;
//                 repositories missing here are scouted
//   baseline      (optional) { [repository path]: { commands: [...] } } from a previous run's
//                 report; repositories missing here are re-baselined

// args can arrive JSON-encoded depending on the caller; normalize before destructuring
const input = typeof args === 'string' ? JSON.parse(args) : args
const { tasksDir, specPath, tasks, repos, reviewSkills, maxFixRounds } = input

const toolchain = new Map(Object.entries(input.toolchain || {}))
const baseline = new Map(Object.entries(input.baseline || {}))

const status = new Map(tasks.map((t) => [t.slug, t.status]))
// Whether a task's branch reached its target is git's knowledge, never a task-file field: the
// merge rounds re-list every implemented task and an already-merged branch no-ops, so a run
// interrupted between implementation and merge resumes correctly for free.
const merged = new Set()
const conflicted = new Set() // merge gave up on these; never retried within this run
const hil = [] // everything that needs a human: operational tasks, blockers, conflicts, unfixable CI
const caveats = [] // agent-flagged facts — deviations, skipped fixes, resolved conflicts — surfaced in the report
const taskBranch = (t) => `task/${t.slug}`
// Worktrees live beside the repository, never inside it, so validation tooling cannot pick them up.
const worktreePath = (repo, name) => `${repo}.worktrees/${name.replace(/\//g, '-')}`
const repoDefault = (repo) => (repos && repos[repo] && repos[repo].defaultRef) || "the repository's default branch"
const byRepo = (list) => {
  const groups = new Map()
  for (const t of list) {
    if (!groups.has(t.repository)) groups.set(t.repository, [])
    groups.get(t.repository).push(t)
  }
  return groups
}
// One retry rides out transient API failures (529s, brief limit blips). A second null is a real
// no-verdict — absence of evidence that must never be reported as a validation verdict.
const tryTwice = async (prompt, opts) =>
  (await agent(prompt, opts)) ?? agent(prompt, { ...opts, label: `${opts.label}:retry` })

// ---- Recon: detect each repository's validation toolchain, then baseline it on the clean base
//      (both kept in memory for this run and returned in the report for a later repair-run)

phase('Recon')

const repositories = [...new Set(tasks.filter((t) => t.repository !== 'none').map((t) => t.repository))]

const missingToolchain = repositories.filter((repo) => !toolchain.get(repo))
if (missingToolchain.length > 0) {
  const reports = await parallel(
    missingToolchain.map((repo) => () =>
      tryTwice(
        `Repository to analyse: ${repo}\n` +
          `Detect how this repository is validated and return your full report.`,
        { agentType: 'fd3:toolchain-scout', label: `scout:${repo.split('/').pop()}`, phase: 'Recon' },
      ),
    ),
  )
  missingToolchain.forEach((repo, i) => {
    if (reports[i]) toolchain.set(repo, reports[i])
    else hil.push({ slug: null, kind: 'no-verdict', stage: 'toolchain', reason: `${repo}: the toolchain scout returned no result after a retry; branches of this repository get no validation verdict this run.` })
  })
}

const BASELINE_RESULT = {
  type: 'object',
  required: ['commands'],
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'passed'],
        properties: {
          command: { type: 'string' },
          passed: { type: 'boolean' },
          failures: { type: 'array', items: { type: 'string' }, description: 'the load-bearing output lines, one entry per distinct problem; only when passed is false' },
        },
      },
    },
    skipped: { type: 'array', items: { type: 'string' }, description: 'commands not run, each with the reason — a skip is never recorded as passed' },
  },
}

const baselinePrompt = (repo) =>
  [
    `Establish the validation baseline of the repository ${repo} on its clean base.`,
    ``,
    `1. Create a worktree at ${worktreePath(repo, 'baseline')} from ${repoDefault(repo)}`,
    `   (git worktree add <path> <ref>) unless it already exists — then reuse it as is.`,
    `2. Run every runnable validation command from the toolchain report below, in the reported`,
    `   order, sequentially — never in parallel. Skip what the report lists as not runnable here,`,
    `   recording each skip under skipped with its reason — a skip is never recorded as passed.`,
    `3. Fix nothing, change nothing. Record, per command, whether it exited 0, and for each`,
    `   failure the output lines that matter.`,
    ``,
    toolchain.get(repo),
  ].join('\n')

// What already fails on the clean base is noise this run must not fight or report as its own.
// Sequential on purpose — at most one build/lint/test pipeline on the machine — and unawaited
// until Validate, so it overlaps the implement waves, which run no pipelines.
const baselineReady = (async () => {
  for (const repo of repositories) {
    if (baseline.get(repo) || !toolchain.get(repo)) continue
    const report = await tryTwice(baselinePrompt(repo), {
      label: `baseline:${repo.split('/').pop()}`,
      phase: 'Recon',
      schema: BASELINE_RESULT,
      model: 'haiku',
      effort: 'high',
    })
    if (report) baseline.set(repo, report)
    else hil.push({ slug: null, kind: 'no-verdict', stage: 'baseline', reason: `${repo}: the baseline agent returned no result after a retry; failures cannot be told apart from pre-existing ones this run.` })
  }
})()

const baselineText = (repo) => {
  const b = baseline.get(repo)
  if (!b) return 'No baseline is available for this repository — treat every failure as introduced by the branch.'
  const lines = b.commands.map((c) =>
    c.passed
      ? `- ${c.command}: passed`
      : `- ${c.command}: FAILED on the clean base:\n` + (c.failures || []).map((f) => `    ${f}`).join('\n'),
  )
  return `Baseline on the clean base (${repoDefault(repo)}):\n${lines.join('\n')}`
}

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

// An implementation agent that does not know what a human owns will do that work in passing; a
// task can become human-owned mid-run, so each wave dispatches with the list as it stands.
const humanOwnedList = () => {
  const lines = hil
    .filter((h) => h.slug)
    .map((h) => {
      const t = tasks.find((x) => x.slug === h.slug)
      return `- ${h.slug}${t ? ` (${t.name})` : ''}: ${h.reason}`
    })
  return lines.length > 0
    ? `Tasks a human owns in this run — never do their work, not even a step of it:\n${lines.join('\n')}`
    : ''
}
let humanOwned = ''

// The files are the state store — a status living only in this run's memory is lost on
// interruption. Only this writer and the done-marker ever write statuses this workflow owns.
const operationalFiles = tasks.filter((t) => t.repository === 'none' && status.get(t.slug) === 'blocked').map((t) => t.file)
if (operationalFiles.length > 0) {
  await tryTwice(
    `Set \`status: blocked\` in the frontmatter of these task files, changing nothing else:\n` +
      operationalFiles.map((f) => `- ${f}`).join('\n'),
    { label: 'mark-blocked', phase: 'Implement', model: 'haiku', effort: 'low' },
  )
}

const IMPLEMENT_RESULT = {
  type: 'object',
  required: ['slug', 'outcome', 'summary'],
  properties: {
    slug: { type: 'string' },
    outcome: { enum: ['implemented', 'blocked'] },
    summary: { type: 'string' },
    reason: { type: 'string', description: 'why the task is blocked; only when outcome is blocked' },
    caveats: { type: 'array', items: { type: 'string' }, description: 'facts the parent must see even on success: an as-built deviation, a spec discrepancy noticed in passing, a done-criterion that cannot pass until a later task lands' },
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
    `   (git worktree add <path> -b <branch> <start-point>). The start-point is the first of these`,
    `   refs that exists — an early wave can run before the later ones are created:`,
    `   ${[task.branch, task.baseBranch, repoDefault(task.repository)].filter(Boolean).join(', then ')}.`,
    `   Everything this task depends on is already merged into whichever you start from. If the`,
    `   worktree already exists from an interrupted attempt, continue in it instead of recreating`,
    `   anything.`,
    `4. Implement exactly what the task's Goal and Done-when describe — nothing more. Work only`,
    `   inside your worktree; the only file you touch outside it is the task file itself.`,
    `5. Do not run linters, test suites or builds — validation is batched later for the whole`,
    `   branch. One exception: when the task's deliverable is a generated artifact whose`,
    `   regeneration requires a build, run that build, inside your worktree only. Commit with a`,
    `   conventional-commit message citing the task's tickets, if any.`,
    `6. On success set \`status: implemented\` in the task file.`,
    ...(humanOwned ? [``, humanOwned] : []),
    ``,
    `If the task requires an action a human must take or approve — anything that touches`,
    `production, anything irreversible, any secret or credential, and whatever this repository's`,
    `own rules reserve — or a decision the task and spec do not settle, stop: set`,
    `\`status: blocked\`, append a \`## Blocked\` section to the task body stating why, and return`,
    `outcome "blocked" with that reason. Never guess your way past a blocker.`,
    ``,
    `Return slug "${task.slug}", the outcome, and a two-sentence summary of what you changed.`,
    `Under caveats, return anything the parent must see even though you succeeded — an as-built`,
    `deviation, a spec discrepancy you noticed, a done-criterion that cannot pass yet.`,
    `A caveat says something the parent could not otherwise know. Following this prompt is not a`,
    `caveat, and neither is a Done-when row the task file already names as branch-level.`,
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
          resolved: {
            type: 'array',
            items: {
              type: 'object',
              required: ['slug', 'description'],
              properties: { slug: { type: 'string' }, description: { type: 'string' } },
            },
            description: 'conflicts resolved mechanically — one entry each, so later review knows where to look',
          },
        },
      },
    },
  },
}

const parked = (repo) => (repos && repos[repo] && repos[repo].parkedBranch) || null

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
        `- target ${branch} (stacks on ${g.base || repoDefault(repo)}, worktree ${branch === parked(repo) ? `${repo} — the main checkout` : worktreePath(repo, branch)}):\n` +
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
    `   missing, create it (replace "/" with "-" in the branch name to form the directory name) —`,
    `   except a target listed as the main checkout: git refuses a second worktree for a branch`,
    `   that is already checked out, so work in the main checkout and report it as the worktree.`,
    `2. Merge the stack base into the target first, so the stack stays current.`,
    `3. Merge the listed task branches into it, in the listed order. A branch that answers`,
    `   "Already up to date" is expected on a resumed run — count its task as merged.`,
    ``,
    `Resolve a merge conflict only when the two sides are clearly compatible and the resolution`,
    `is mechanical; commit the resolution and record it under resolved — the task's slug and one`,
    `line on what you chose; a resolved conflict is exactly where a later review should look.`,
    `When a conflict needs a judgment call, abort that merge (git merge --abort), record the task`,
    `under conflicts, and continue with the rest.`,
    ``,
    `Return every target branch you touched with its worktree path, the slugs of the tasks now`,
    `merged in, the conflicts, and the resolved list (empty arrays when clean).`,
  ].join('\n')
}

const units = [] // { repo, branch, worktree, base, tasks } — the units validation runs on, in merge order
const recordUnit = (repo, b, slugs) => {
  let unit = units.find((u) => u.repo === repo && u.branch === b.branch)
  if (!unit) {
    const sample = tasks.find((t) => t.repository === repo && t.branch === b.branch)
    unit = { repo, branch: b.branch, worktree: b.worktree, base: (sample && sample.baseBranch) || repoDefault(repo), tasks: [] }
    units.push(unit)
  }
  for (const slug of slugs) if (!unit.tasks.includes(slug)) unit.tasks.push(slug)
}

let wave = 0
while (true) {
  humanOwned = humanOwnedList()

  // A dependency counts as satisfied only once its branch is in the target — done tasks
  // passed validation on a merged branch, implemented ones must have cleared a merge round.

  // A stacked branch's tasks start from its base, so the base must already carry its work — a task
  // that starts from a base that is not there yet writes against files it cannot see.
  const baseReady = (t) =>
    tasks
      .filter((x) => x.repository === t.repository && x.branch === t.baseBranch)
      .every((x) => status.get(x.slug) === 'done' || merged.has(x.slug))

  const ready = tasks.filter(
    (t) =>
      status.get(t.slug) === 'todo' &&
      t.dependsOn.every((dep) => status.get(dep) === 'done' || merged.has(dep)) &&
      baseReady(t),
  )

  if (ready.length > 0) {
    wave += 1
    log(`Wave ${wave}: ${ready.map((t) => t.slug).join(', ')}`)

    const results = await parallel(
      ready.map((task) => () =>
        tryTwice(implementPrompt(task), {
          label: `wave${wave}:${task.slug}`,
          phase: 'Implement',
          schema: IMPLEMENT_RESULT,
        }),
      ),
    )

    ready.forEach((task, i) => {
      const result = results[i]
      if (result && result.caveats) caveats.push(...result.caveats.map((c) => `${task.slug}: ${c}`))
      if (result && result.outcome === 'implemented') {
        status.set(task.slug, 'implemented')
      } else {
        status.set(task.slug, 'blocked')
        hil.push({
          slug: task.slug,
          kind: result ? 'implementation' : 'no-verdict',
          reason: result
            ? result.reason || result.summary
            : 'The implementation agent died twice without a result; its worktree may hold partial work — inspect before rerunning.',
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
        tryTwice(mergePrompt(repo, repoTasks), {
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
        hil.push({ slug: null, kind: 'no-verdict', stage: 'merge', reason: `The merge agent for ${repo} died twice without a result; git holds the actual merge state.` })
        return
      }
      for (const b of report.branches) {
        for (const slug of b.mergedSlugs) merged.add(slug)
        for (const r of b.resolved || []) caveats.push(`${b.branch} merge of ${r.slug}: resolved conflict — ${r.description}`)
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

// Deliberate gaps must be visible to the review and fix agents below, or they will "fix" a
// reserved human step or a blocked task's intentionally missing artifact.
const reservationLines = hil
  .filter((h) => h.slug)
  .map((h) => {
    const t = tasks.find((x) => x.slug === h.slug)
    return `- ${h.slug}${t ? ` (${t.name})` : ''}: ${h.reason}`
  })
  .concat(
    unreachable.map((slug) => {
      const t = tasks.find((x) => x.slug === slug)
      return `- ${slug}${t ? ` (${t.name})` : ''}: not implemented yet — waits behind a blocked dependency or an unfinished base`
    }),
  )
const reservations =
  reservationLines.length > 0
    ? `Open work on this task graph — deliberately unfinished, human-owned or blocked:\n${reservationLines.join('\n')}`
    : ''

// ---- Validate: one branch at a time, so at most one build/lint/test pipeline runs at once

phase('Validate')

await baselineReady

const CI_RESULT = {
  type: 'object',
  required: ['passed', 'failures'],
  properties: {
    passed: { type: 'boolean', description: 'true when nothing fails beyond the baseline' },
    failures: { type: 'array', items: { type: 'string' }, description: 'one entry per newly failing command, with the load-bearing output lines' },
    preExisting: { type: 'array', items: { type: 'string' }, description: 'failures that match the baseline of the clean base — informational, never fixed on this branch' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'commands not run, each with the reason — a skip is never reported as passed' },
  },
}

const FIX_RESULT = {
  type: 'object',
  required: ['summary'],
  properties: {
    summary: { type: 'string' },
    caveats: { type: 'array', items: { type: 'string' }, description: 'problems skipped with the reason, judgment calls that went beyond the listed problems, and any change that touches a spec decision' },
  },
}

const CR_RESULT = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: { type: 'array', items: { type: 'string' }, description: 'one entry per finding worth fixing: file, problem, why' },
  },
}

const ciPrompt = (unit, mode) =>
  [
    `Run the validation commands for the repository ${unit.repo}, branch ${unit.branch},`,
    `in the worktree ${unit.worktree}. Run them in the reported order, sequentially — never in`,
    `parallel. Toolchain report for this repository:`,
    ``,
    toolchain.get(unit.repo),
    ``,
    baselineText(unit.repo),
    ``,
    mode === 'scoped'
      ? `Scope the run to this branch's changes: list them with` +
        `\n\`git diff --name-only ${unit.base}...HEAD\` — ${unit.base} is the base, never diff the` +
        `\nbranch against itself — and use each command's scoped form from the report on those` +
        `\npaths, quoting every path you pass to a shell (unquoted brackets and globs break zsh);` +
        `\nrun a command in full only when the report marks it not scopeable.`
      : `Run every command in full — this is the branch's final gate before it is handed over.`,
    ``,
    `Skip everything the report lists as not runnable here, and skip a command the baseline`,
    `shows failing before it produces a verdict — re-proving a baseline failure is wasted time.`,
    `Every skip goes under skipped with its reason; a skip is never reported as passed. Do not`,
    `fix anything. A failure whose location and message match the baseline is pre-existing:`,
    `return it under preExisting, never under failures, and do not count it against the branch.`,
    `Return passed=true only when every runnable command exits 0 or fails only on baseline`,
    `entries; otherwise return each newly failing command with the output lines that matter.`,
  ].join('\n')

const fixPrompt = (unit, problems, source) =>
  [
    `Fix ${source} problems on branch ${unit.branch} in the worktree ${unit.worktree}`,
    `(repository ${unit.repo}). Problems:`,
    ``,
    ...problems.map((p) => `- ${p}`),
    ``,
    ...(reservations ? [reservations, ``] : []),
    `Fix only what is listed — no refactoring, no drive-by changes, and never touch problems`,
    `that pre-date this branch. The open work above is deliberate: never do it and never fill`,
    `the gaps it leaves. A listed problem that cannot be fixed without an action a human must`,
    `take or approve — anything that touches production, anything irreversible, any secret or`,
    `credential, generating a migration, and whatever this repository's own rules reserve — is a`,
    `blocker, not a fix: skip it and record it under caveats. Never guess your way past it.`,
    ``,
    `Toolchain report for this repository — when a fix changes something a listed command`,
    `derives an artifact from, regenerate that artifact the way the report says:`,
    ``,
    toolchain.get(unit.repo),
    ``,
    `Commit the fixes with a conventional-commit message. To verify a fix you may re-run the`,
    `exact commands that failed — never the full validation suite; it is rerun after you.`,
    ``,
    `Return a two-sentence summary. Under caveats, return every problem you skipped with the`,
    `reason, any judgment call that went beyond the listed problems, and any change that touches`,
    `a decision recorded in the spec.`,
    `A caveat says something the parent could not otherwise know. Following this prompt is not a`,
    `caveat.`,
  ].join('\n')

const reviewPrompt = (unit, skillName) =>
  [
    `In the worktree ${unit.worktree} (repository ${unit.repo}), review the branch ${unit.branch}:`,
    `invoke the \`${skillName}\` skill via the Skill tool on the diff between this branch and`,
    `${unit.base}. Report, do not fix.`,
    ``,
    `\`git diff ${unit.base}...HEAD\` is the whole territory: the files it touches and the direct`,
    `call sites of what they change. The rest of the repository, the architecture and the`,
    `validation suite are out of scope. The narrowing is of territory, not of severity.`,
    ``,
    baselineText(unit.repo),
    ``,
    ...(reservations ? [reservations, ``] : []),
    `Report only findings this branch's diff introduces. An issue that exists identically on the`,
    `clean base — including everything in the baseline above — is pre-existing: leave it out. So`,
    `is the open work listed above and its direct consequences: a gap a blocked or human-owned`,
    `task deliberately leaves is not a finding.`,
    ``,
    `Return only the findings worth fixing, one entry each: file, the problem, and why it matters.`,
    `An empty findings array is a valid result.`,
  ].join('\n')

const mechanical = { model: 'haiku', effort: 'high' } // CI runners interpret command output; they design nothing

const validation = [] // per-branch summary for the final report

const REFRESH_RESULT = {
  type: 'object',
  required: ['refreshed'],
  properties: {
    refreshed: { type: 'boolean' },
    conflict: { type: 'string', description: 'what needs a judgment call; only when refreshed is false' },
  },
}

for (const unit of units) {
  const repoName = unit.repo.split('/').pop()
  const summary = { repo: unit.repo, branch: unit.branch, ci: 'pending', fixRounds: 0, reviewFindings: 0, findings: [], preExisting: 0 }
  validation.push(summary)

  if (!toolchain.get(unit.repo)) {
    summary.ci = 'no-verdict' // the scout's death is already on the HIL list, once per repository
    continue
  }

  // A stacked branch may predate fixes its base received during the base's own validation;
  // validating against a stale base re-finds the base's problems and re-fixes them divergently.
  if (units.some((u) => u !== unit && u.repo === unit.repo && u.branch === unit.base)) {
    const refresh = await tryTwice(
      [
        `In the worktree ${unit.worktree} (repository ${unit.repo}), merge ${unit.base} into`,
        `${unit.branch}, so the branch is validated against its current base. Resolve a conflict`,
        `only when the resolution is mechanical; commit it. When a conflict needs a judgment`,
        `call, abort (git merge --abort) and return refreshed=false with the conflict described.`,
      ].join('\n'),
      { label: `refresh:${unit.branch.replace(/\//g, '-')}`, phase: 'Validate', schema: REFRESH_RESULT },
    )
    if (!refresh || !refresh.refreshed) {
      summary.ci = refresh ? 'skipped' : 'no-verdict'
      hil.push({
        slug: null,
        kind: refresh ? 'merge-conflict' : 'no-verdict',
        stage: 'base-refresh',
        reason: refresh
          ? `${unit.repo} ${unit.branch}: merging the refreshed base ${unit.base} needs a judgment call: ${refresh.conflict}; the branch was not validated.`
          : `${unit.repo} ${unit.branch}: the base-refresh agent returned no result after a retry; the branch was not validated.`,
      })
      continue
    }
  }

  let ci = await tryTwice(ciPrompt(unit, 'scoped'), { label: `ci:${repoName}`, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  while (ci && !ci.passed && summary.fixRounds < maxFixRounds) {
    summary.fixRounds += 1
    const fix = await tryTwice(fixPrompt(unit, ci.failures, 'CI'), { label: `fix-ci:${repoName}#${summary.fixRounds}`, phase: 'Validate', schema: FIX_RESULT })
    if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-ci: ${c}`))
    ci = await tryTwice(ciPrompt(unit, 'scoped'), { label: `ci:${repoName}#${summary.fixRounds + 1}`, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  }
  if (!ci) {
    summary.ci = 'no-verdict'
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'ci',
      reason: `${unit.repo} ${unit.branch}: the CI agent returned no result after a retry (transient API failure); the branch has no verdict after ${summary.fixRounds} fix rounds — absence of evidence, not a failure.`,
    })
    continue
  }
  summary.preExisting = (ci.preExisting || []).length
  if (!ci.passed) {
    summary.ci = 'failed'
    hil.push({
      slug: null,
      kind: 'ci',
      reason: `${unit.repo} ${unit.branch}: CI still failing after ${summary.fixRounds} fix rounds: ${ci.failures.join('; ')}`,
    })
    continue
  }
  summary.ci = 'passed'

  // Review skills are read-only lenses; they can run in parallel — unlike CI they hog no cores.
  let deadLenses = []
  if (reviewSkills.length > 0) {
    const reviews = await parallel(
      reviewSkills.map((skillName) => () =>
        tryTwice(reviewPrompt(unit, skillName), { label: `cr:${skillName}:${repoName}`, phase: 'Validate', schema: CR_RESULT }),
      ),
    )
    deadLenses = reviewSkills.filter((_, i) => !reviews[i])
    const findings = reviews.filter(Boolean).flatMap((r) => r.findings)
    summary.reviewFindings = findings.length
    summary.findings = findings
    if (findings.length > 0) {
      const fix = await tryTwice(fixPrompt(unit, findings, 'code-review'), { label: `fix-cr:${repoName}`, phase: 'Validate', schema: FIX_RESULT })
      if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-cr: ${c}`))
    }
  }

  // The full command list is the branch's final gate — always, review fixes or not.
  let finalCi = await tryTwice(ciPrompt(unit, 'full'), { label: `ci:${repoName}:final`, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  if (finalCi && !finalCi.passed) {
    // One fix round here: a final-gate failure is often mechanical — a derived artifact the
    // review fixes invalidated — and only what survives the round deserves a human.
    summary.fixRounds += 1
    const fix = await tryTwice(fixPrompt(unit, finalCi.failures, 'final-gate CI'), { label: `fix-final:${repoName}`, phase: 'Validate', schema: FIX_RESULT })
    if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-final: ${c}`))
    finalCi = await tryTwice(ciPrompt(unit, 'full'), { label: `ci:${repoName}:final#2`, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  }
  if (!finalCi) {
    summary.ci = 'no-verdict'
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'ci-final',
      reason: `${unit.repo} ${unit.branch}: scoped CI passed but the full-gate agent returned no result after a retry; the branch has no final verdict.`,
    })
    continue
  }
  summary.preExisting = (finalCi.preExisting || []).length
  if (!finalCi.passed) {
    summary.ci = 'failed-final'
    hil.push({
      slug: null,
      kind: 'ci',
      reason: `${unit.repo} ${unit.branch}: the full run after the fix and review rounds failed: ${finalCi.failures.join('; ')}`,
    })
    continue
  }

  // A dead lens is not an empty findings list: the branch stays implemented until reviewed.
  if (deadLenses.length > 0) {
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'review',
      reason: `${unit.repo} ${unit.branch}: review lens ${deadLenses.join(', ')} returned no result after a retry; CI passed, but the branch keeps status implemented until the lens has run.`,
    })
    continue
  }

  const markedDone = await tryTwice(
    `In ${tasksDir}, set \`status: done\` in the frontmatter of these task files, changing nothing else:\n` +
      unit.tasks.map((slug) => `- ${tasks.find((t) => t.slug === slug).file}`).join('\n'),
    { label: `done:${repoName}`, phase: 'Validate', model: 'haiku', effort: 'low' },
  )
  if (markedDone == null) {
    // The files are the state store; in-memory state must never outrun them.
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'done-marking',
      reason: `${unit.repo} ${unit.branch}: validation passed but the done-marking agent returned no result; the task files still read implemented — a relaunch re-validates cheaply and finishes the marking.`,
    })
    continue
  }
  unit.tasks.forEach((slug) => status.set(slug, 'done'))
}

return {
  tasks: tasks.map((t) => ({ slug: t.slug, status: status.get(t.slug) })),
  branches: validation,
  hil,
  unreachable,
  // What agents flagged on the way to success — deviations, skipped fixes, resolved conflicts.
  // These must reach the user; they die in transcripts otherwise.
  caveats,
  // Recon knowledge, returned so a relaunch or a follow-up repair-run reuses it instead of re-scouting.
  toolchain: Object.fromEntries(toolchain),
  baseline: Object.fromEntries(baseline),
}

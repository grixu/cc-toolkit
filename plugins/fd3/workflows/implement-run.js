export const meta = {
  name: 'implement-run',
  description: 'Implement spec tasks in dependency-ordered waves, merging each wave into its target branch, then validate each branch once; with mode "repair", apply human HIL decisions to existing task branches and review what the repair changed',
  whenToUse: 'Launched by the fd3:implement-tasks skill, with a parsed task graph or, in mode "repair", with the HIL decisions the user made on an earlier report; not meant to be invoked bare.',
  phases: [
    { title: 'Recon', detail: 'toolchain detection and a baseline run per repository, unless an earlier report hands them over' },
    { title: 'Implement', detail: 'parallel waves gated by the depends-on graph, each wave merged into its target branch' },
    { title: 'Repair', detail: 'mode "repair": one agent per branch, the HIL decision applied verbatim; a stacked branch after its base' },
    { title: 'Validate', detail: 'CI, then a code-review pass (on a repair: a decision-conformance check and a correctness/security review of the repair delta) with its fixes, one branch at a time' },
  ],
}

// args, provided by the fd3:implement-tasks skill (the script has no filesystem access):
//   mode          (optional) 'implement', the default, or 'repair'
//   specPath      absolute path of the specification file the tasks point into; optional under
//                 repair, where it serves the review's spec lens and the build-spec route agents
//                 name for a spec change
//   repos         { [repository path]: { startRef, diffBase, parkedBranch } } — startRef is the ref
//                 new branches are cut from (e.g. "origin/main", or the branch the user parked the
//                 checkout on); diffBase is what a root branch's diff is measured against, always
//                 origin/<default>; the skill fetches before launch, so origin/* is fresh.
//                 parkedBranch (optional) names the target branch checked out in the main
//                 repository itself — git refuses a second worktree for it, so the main checkout
//                 serves as that branch's worktree
//   review        true to run the code-review plugin's headless lenses on every branch after its
//                 CI passes and fix what they find; "gated" to review the same way but hold
//                 security, boy-scout, unfixed and fix-review findings for a human; false skips review.
//                 Under repair, only the repair's own delta of a branch with instructions is reviewed
//   decisions     (optional) [string] — the user's standing decisions on this task graph from earlier
//                 report rounds, verbatim; review and fix agents treat a finding against one as
//                 reserved, and under repair each repair's own instructions count as decisions too
//   maxFixRounds  CI fix attempts per branch before giving up
//   reportPath    (optional) absolute path of a previous run's report file; one cheap agent reads
//                 its toolchain and baseline knowledge, so a relaunch skips the re-scout and the
//                 re-baseline of every repository it already knows
//   toolchain     (optional) { [repository path]: <scout report> } — an alternative to reportPath
//                 for a caller that already holds the reports; repositories missing from both are
//                 scouted
//   baseline      (optional) { [repository path]: { commands: [...] } } — likewise
// mode 'implement' only:
//   tasks         [{ slug, file, name, repository, branch, baseBranch, phase, dependsOn, status }]
//                 repository is an absolute path, or 'none' for an operational task; baseBranch is
//                 the branch this task's target branch stacks on, or null for the repository's
//                 base ref; status is one of todo | implemented | merged | blocked | done (stale
//                 in-progress is reset by the skill before launch)
//   knownBases    (optional) ["<repository path>:<branch>"] — branch-bases no task builds that the
//                 skill already resolved to an existing branch; they raise no graph item
// mode 'repair' only:
//   repairs       [{ repo, branch, worktree, base, instructions, taskFiles }]
//                 repo and worktree are absolute paths; base is the ref the branch's diff is
//                 measured against (its stack base, or the repo's diffBase); instructions carry
//                 the user's HIL decisions verbatim, empty for a branch only stacked on a repaired
//                 one (carried onto it and validated); taskFiles are the task files to flip to done
//                 when the branch passes, may be empty

// args can arrive JSON-encoded depending on the caller; normalize before destructuring
const input = typeof args === 'string' ? JSON.parse(args) : args
const repairMode = input.mode === 'repair'
const { specPath, repos } = input
const tasks = repairMode ? [] : input.tasks
const repairs = repairMode ? input.repairs : []
const specRef = specPath ? `the specification at ${specPath}` : 'the specification'
const specArg = specPath || '<spec>'
const review = input.review === true || input.review === 'gated'
const gated = input.review === 'gated'
// Undefined would make every `fixRounds < maxFixRounds` false and silently skip the fix rounds
// the run exists to perform, reporting failures it was built to repair.
const maxFixRounds = input.maxFixRounds ?? 3

const toolchain = new Map(Object.entries(input.toolchain || {}))
const baseline = new Map(Object.entries(input.baseline || {}))

const status = new Map(tasks.map((t) => [t.slug, t.status]))
const hil = [] // everything that needs a human: operational tasks, blockers, conflicts, refused decisions, unfixable CI
const caveats = [] // agent-flagged facts — deviations, skipped fixes, resolved conflicts — surfaced in the report
// Worktrees live beside the repository, never inside it, so validation tooling cannot pick them up.
const worktreePath = (repo, name) => `${repo}.worktrees/${name.replace(/\//g, '-')}`
// Every validation label names the unit, never just the repository: one repository carries many
// target branches, and without the branch a fix loop and a fan-out look identical in the run view.
const unitTag = (unit) => `${unit.repo.split('/').pop()}:${unit.branch.replace(/\//g, '-')}`
// Where work starts and what it is measured against part ways when the run builds on a branch the
// user parked the checkout on: worktrees start from that branch, and a diff against it is empty.
const refOf = (repo, key) => (repos && repos[repo] && repos[repo][key]) || "the repository's default branch"
const startRef = (repo) => refOf(repo, 'startRef')
const diffBase = (repo) => refOf(repo, 'diffBase')
const unitBase = (unit) => unit.base || diffBase(unit.repo)
// The harness relays the user's request to every agent, and a cheap model reads it as its own task
// and re-runs the skill that launched this workflow. A skill the task file names for its step is
// the task's own, and forbidding it left that step undone.
const STEP_GUARD =
  'Do only the step this prompt describes. Invoke no skill or slash command unless this prompt names it ' +
  'or the task file it points you to directs this step to use it, whatever the relayed user request says: ' +
  'that request belongs to the session that launched this workflow.\n\n'
// A runner whose shell timed out on a long build used to background it and return: the unfinished
// build then read as a failure, fed fix rounds that had nothing to fix, or was skipped as broken.
const waitRule = (unfinished) =>
  'A command is finished only when its exit line exists. When one may outlast your shell timeout, ' +
  // $TMPDIR outlives a run, so a fixed log name can find the previous run's exit file already there.
  'start it in the background with its status written to a file under a name no earlier run used — ' +
  '`<log>` is the path `mktemp "${TMPDIR:-/tmp}/ci.XXXXXX"` prints, written out literally in every later command since shell variables do not survive between calls — ' +
  'then `( <command> > <log> 2>&1; echo "exit $?" > <log>.exit ) &` — ' +
  'and wait for that file with `until [ -s <log>.exit ]; do sleep 15; done` in the foreground with the Bash `timeout` at 600000, ' +
  'repeating the wait as often as it times out. A wait the shell moved to the background has not finished, and nothing resumes ' +
  'you once you return: never end your turn on a ScheduleWakeup or a background task — wait again instead. ' +
  `Never return while a command you started has no exit line; if you must stop before one finishes, ${unfinished}. ` +
  'An unfinished command is never a failure and never a pass.'
// CI runners interpret command output; they design nothing. Their agent type has no tool that
// schedules a later turn: a Haiku runner given one ended its turn on it mid-build despite the ban.
const mechanical = { agentType: 'fd3:ci-runner', model: 'haiku', effort: 'high' }
// The main checkout is the user's own tree: an agent clearing it to get a merge or a fix through
// takes their uncommitted and untracked work with it.
const checkoutRule = (repo) =>
  `${repo} is the user's own checkout: never run \`git clean\`, \`git reset --hard\`, \`git stash\`, ` +
  `\`git checkout -- .\` or \`git restore .\` in it, and stage only the files you changed, by name — ` +
  `every other modified or untracked file there is the user's.`
// One retry rides out transient API failures (529s, brief limit blips). A second null is a real
// no-verdict — absence of evidence that must never be reported as a validation verdict.
const tryTwice = async (prompt, opts) =>
  (await agent(STEP_GUARD + prompt, opts)) ?? agent(STEP_GUARD + prompt, { ...opts, label: `${opts.label}:retry` })

// ---- Recon: detect each repository's validation toolchain, then baseline it on the clean base
//      (both kept in memory for this run and returned in the report for a later relaunch or repair)

phase('Recon')

const repositories = repairMode
  ? [...new Set(repairs.map((r) => r.repo))]
  : [...new Set(tasks.filter((t) => t.repository !== 'none').map((t) => t.repository))]

const BASELINE_COMMANDS = {
  type: 'array',
  items: {
    type: 'object',
    required: ['command', 'passed'],
    properties: {
      command: { type: 'string' },
      passed: { type: 'boolean' },
      completed: { type: 'boolean', description: 'false when the command had no exit line when you returned; passed is then false and failures says how far it got' },
      failures: { type: 'array', items: { type: 'string' }, description: 'the load-bearing output lines, one entry per distinct problem; only when passed is false' },
    },
  },
}

const BASELINE_DIRTY = { type: 'array', items: { type: 'string' }, description: 'paths `git status --porcelain` lists after the last command, relative to the worktree root' }

const BASELINE_RESULT = {
  type: 'object',
  required: ['commands'],
  properties: {
    commands: BASELINE_COMMANDS,
    skipped: { type: 'array', items: { type: 'string' }, description: 'commands not run, each with the reason — a skip is never recorded as passed' },
    dirty: BASELINE_DIRTY,
  },
}

const HANDOVER_RESULT = {
  type: 'object',
  required: ['toolchain', 'baseline'],
  properties: {
    toolchain: {
      type: 'array',
      items: {
        type: 'object',
        required: ['repository', 'report'],
        properties: {
          repository: { type: 'string' },
          report: { type: 'string', description: "the repository's toolchain report, verbatim and entire" },
        },
      },
    },
    baseline: {
      type: 'array',
      items: {
        type: 'object',
        required: ['repository', 'commands'],
        properties: { repository: { type: 'string' }, commands: BASELINE_COMMANDS, dirty: BASELINE_DIRTY },
      },
    },
  },
}

// A previous run's recon knowledge is already in its report file, and one cheap read of it costs
// less than one scout of one repository. Hand-copying it into the launch call is what nobody does.
if (input.reportPath && repositories.some((repo) => !toolchain.get(repo))) {
  const handover = await tryTwice(
    [
      `Read the previous run's report at ${input.reportPath} and return the recon knowledge it holds`,
      `for these repositories:`,
      ...repositories.map((repo) => `- ${repo}`),
      ``,
      `Return each repository's toolchain report verbatim — the whole string, unedited — and its`,
      `baseline command list with its dirty paths. Omit a repository the report does not carry. Never summarise, reformat`,
      `or reconstruct a toolchain report: the baseline is matched against it by command string, so a`,
      `command list that differs from the one the baseline measured is worse than no baseline.`,
      `A command whose recorded failure says it did not finish — still running, backgrounded, no`,
      `exit line — is returned with completed=false.`,
    ].join('\n'),
    { label: 'handover', phase: 'Recon', schema: HANDOVER_RESULT, model: 'haiku', effort: 'low' },
  )
  if (handover) {
    for (const t of handover.toolchain || []) if (!toolchain.get(t.repository)) toolchain.set(t.repository, t.report)
    for (const b of handover.baseline || []) if (!baseline.get(b.repository)) baseline.set(b.repository, { commands: b.commands, dirty: b.dirty || [] })
  }
}

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
  // baselineText() matches by command string, so a baseline measured against a different scout
  // report silently stops covering commands it never named — worse than having no baseline.
  for (const repo of missingToolchain) baseline.delete(repo)
}

const baselinePrompt = (repo) =>
  [
    `<toolchain_report>`,
    toolchain.get(repo),
    `</toolchain_report>`,
    ``,
    `Establish the validation baseline of the repository ${repo} on its clean base.`,
    ``,
    `1. Create a worktree at ${worktreePath(repo, 'baseline')} from ${startRef(repo)}`,
    `   (git worktree add --detach <path> <ref>) unless it already exists — then reuse it as is.`,
    `   Detached, because the ref may be a branch already checked out elsewhere, which git refuses`,
    `   a second worktree for.`,
    `2. Run every runnable validation command from <toolchain_report>, in the reported`,
    `   order, sequentially — never in parallel. Each command's cwd in <toolchain_report> is relative to`,
    `   the repository root: resolve it inside that worktree, never against ${repo}. Skip what`,
    `   <toolchain_report> lists as not runnable here, recording each skip under skipped with its reason — a`,
    `   skip is never recorded as passed.`,
    `3. Fix nothing, change nothing. Run each command once, as`,
    `   \`<command> > ${worktreePath(repo, 'baseline')}.log 2>&1; echo "exit $?"\` — the log sits beside`,
    `   the worktree, never inside it. Read pass or fail from that exit line alone, and the log only`,
    `   for the lines a failure needs; never pipe a command into \`tail\`, \`head\` or \`grep\`, whose`,
    `   status then replaces the command's. Record, per command, whether it exited 0, and for each`,
    `   failure the output lines that matter. ${waitRule('record it with completed=false and the last log line it reached')}`,
    `4. When the last command has run, run \`git status --porcelain\` in that worktree and return every`,
    `   path it lists under dirty: what the commands themselves write into a clean tree.`,
  ].join('\n')

// What already fails on the clean base is noise this run must not fight or report as its own.
// Sequential on purpose — at most one build/lint/test pipeline on the machine — and unawaited
// until Validate, so it overlaps the implement waves or the repair agents, which run no pipelines.
const baselineReady = (async () => {
  for (const repo of repositories) {
    if (baseline.get(repo) || !toolchain.get(repo)) continue
    const report = await tryTwice(baselinePrompt(repo), {
      label: `baseline:${repo.split('/').pop()}`,
      phase: 'Recon',
      schema: BASELINE_RESULT,
      ...mechanical,
    })
    if (report) {
      baseline.set(repo, report)
      const unfinished = report.commands.filter((c) => c.completed === false).map((c) => c.command)
      if (unfinished.length > 0) caveats.push(`${repo}: the baseline left ${unfinished.join('; ')} without a verdict; CI runs it in full on every branch`)
    } else hil.push({ slug: null, kind: 'no-verdict', stage: 'baseline', reason: `${repo}: the baseline agent returned no result after a retry; failures cannot be told apart from pre-existing ones this run.` })
  }
})().catch((err) => {
  // Nothing awaits this until Validate, phases away, so an escaping rejection would take the
  // whole run down. Absorb it into the same no-verdict item a missing baseline already produces.
  hil.push({ slug: null, kind: 'no-verdict', stage: 'baseline', reason: `the baseline pass threw before Validate (${err && err.message ? err.message : err}); failures cannot be told apart from pre-existing ones this run.` })
})

// The baseline was measured with the base report's commands; a command only this branch's own
// report names has none, and its pre-existing failures would otherwise be blamed on the branch.
const ownToolchainNote = (unit) =>
  toolchainFor(unit) === toolchain.get(unit.repo)
    ? []
    : [
        ``,
        `The report in <toolchain_report> was detected on the branch itself, so a command it names that`,
        `<baseline> lacks has no baseline. When such a command fails, run it once in the clean`,
        `base worktree ${worktreePath(unit.repo, 'baseline')}: a failure that occurs there too is pre-existing.`,
      ]

const baselineText = (repo) => {
  const b = baseline.get(repo)
  if (!b) return 'No baseline is available for this repository — treat every failure as introduced by the branch.'
  const lines = b.commands.map((c) =>
    c.completed === false
      ? `- ${c.command}: NO VERDICT on the clean base (it did not finish) — run it in full on this branch; never skip it`
      : c.passed
        ? `- ${c.command}: passed`
        : `- ${c.command}: FAILED on the clean base:\n` + (c.failures || []).map((f) => `    ${f}`).join('\n'),
  )
  return `Baseline on the clean base (${startRef(repo)}):\n${lines.join('\n')}`
}

const REFRESH_RESULT = {
  type: 'object',
  required: ['refreshed'],
  properties: {
    refreshed: { type: 'boolean' },
    conflict: { type: 'string', description: 'what needs a judgment call; only when refreshed is false' },
    reviewBase: { type: 'string', description: 'the synthetic review base commit; only when one was asked for and built' },
  },
}

// A repair-delta review measured from the pre-merge commit would re-read every commit the merge
// brought in, so the review base is that commit with the same base merged in, built off any worktree.
const refreshBase = (unit, label, phaseName, reviewFrom) =>
  tryTwice(
    [
      `In the worktree ${unit.worktree} (repository ${unit.repo}), merge ${unit.base} into`,
      `${unit.branch}, so the branch ${repairMode ? 'builds on its repaired base' : 'is validated against its current base'}. Resolve a conflict`,
      `only when the resolution is mechanical; commit it. When a conflict needs a judgment`,
      `call, abort (git merge --abort) and return refreshed=false with the conflict described.`,
      `Return refreshed=true when the merge landed or the branch already contained ${unit.base}.`,
      ...(unit.worktree === unit.repo ? [checkoutRule(unit.repo)] : []),
      ...(reviewFrom
        ? [
            ``,
            `Then build the review base: run \`git -C ${unit.worktree} merge-tree --write-tree ${reviewFrom} ${unit.base}\`.`,
            `When it exits 0, run \`git -C ${unit.worktree} commit-tree <tree> -p ${reviewFrom} -p ${unit.base} -m "fd3 review base"\``,
            `with the tree id it printed, and return the commit it prints as reviewBase. When it exits`,
            `non-zero, return no reviewBase. Neither command touches the worktree or any branch.`,
          ]
        : []),
    ].join('\n'),
    { label, phase: phaseName, schema: REFRESH_RESULT, model: 'sonnet' },
  )

const units = [] // the branches validation runs on, in merge or repair order

if (repairMode) {
  // ---- Repair: the decision is the authority; agents apply it, they do not re-design

  phase('Repair')

  const REPAIR_RESULT = {
    type: 'object',
    required: ['outcome', 'summary', 'fromSha'],
    properties: {
      outcome: { enum: ['repaired', 'blocked'] },
      summary: { type: 'string' },
      reason: { type: 'string', description: 'why the decision could not be applied; only when outcome is blocked' },
      fromSha: { type: 'string', description: '`git rev-parse HEAD` in the worktree before the first edit' },
      caveats: { type: 'array', items: { type: 'string' }, description: 'side effects of applying the decision literally that the human should see — a degraded type, a narrower behavior than the decision may have intended' },
    },
  }

  const repairPrompt = (r) =>
    [
      `Repair the branch ${r.branch} of the repository ${r.repo}, in the worktree ${r.worktree}.`,
      ``,
      `A human reviewed this branch and decided:`,
      ...r.instructions.map((x) => `- ${x}`),
      ``,
      `The authority for this change is the decision quoted above — not the specification and not`,
      `your own reading of the design. Do not read the spec; do not re-derive the design; apply`,
      `the decision exactly as stated.`,
      `Never edit, copy or commit ${specRef}, even when a decision above asks for it: the spec`,
      `changes only through \`/fd3:build-spec ${specArg}\`. Apply the rest and name the spec change`,
      `under caveats with that command; when a decision is nothing but a spec change, return outcome`,
      `"blocked" with that reason.`,
      ``,
      `Before your first edit, run \`git rev-parse HEAD\` in the worktree and return it as fromSha.`,
      `Work only inside the worktree. Do not run linters, test suites or builds — validation runs`,
      `after you. Make every edit with the Edit tool — never \`sed -i\`, a Python or heredoc rewrite,`,
      `or any script that rewrites a file: a scripted rewrite changes lines no decision named, and the`,
      `review of the repair then reads them as new code. Make one commit per decision quoted above, each with a conventional-commit message`,
      `describing that decision's change — a reviewer reverts or questions one decision, never a bundle.`,
      `Merge no other branch into this one unless a decision above says to: the workflow brings a`,
      `stacked branch up to its repaired base itself, after that base's repair has landed.`,
      ``,
      ...(r.worktree === r.repo ? [checkoutRule(r.repo), ``] : []),
      `Return outcome "repaired" with a two-sentence summary of what changed, or outcome "blocked"`,
      `with the reason when the decision cannot be applied as stated. Never guess past an ambiguity.`,
      `Under caveats, return every side effect of applying the decision literally that the human`,
      `should see — a degraded type, a narrower behavior than the decision may have intended.`,
    ].join('\n')

  // Repair agents edit code and run no pipelines, so they run in parallel across branches — except a
  // branch stacked on another branch under repair, which waits for it and merges the repaired base
  // before its own agent starts: otherwise it repairs code its base's repair has already changed.
  const stackedOnPending = (i, pending) =>
    repairs.some((b, j) => j !== i && pending.has(j) && b.repo === repairs[i].repo && b.branch === repairs[i].base)
  const repairedBase = (i) =>
    repairs.some((b, j) => j !== i && b.repo === repairs[i].repo && b.branch === repairs[i].base && repairResults[j] && repairResults[j].outcome === 'repaired')
  const repairResults = new Array(repairs.length)
  const preRefused = new Map() // index → the HIL item that kept its repair from starting
  const repairOrder = []
  const pending = new Set(repairs.map((_, i) => i))
  while (pending.size > 0) {
    const ready = [...pending].filter((i) => !stackedOnPending(i, pending))
    // A cycle of bases cannot be ordered; run it as given rather than never.
    const batch = ready.length > 0 ? ready : [...pending]
    const results = await parallel(
      batch.map((i) => async () => {
        const r = repairs[i]
        if (repairedBase(i)) {
          const refresh = await refreshBase(r, `refresh:${unitTag(r)}:pre-repair`, 'Repair', null)
          if (!refresh || !refresh.refreshed) {
            preRefused.set(i, {
              slug: null,
              kind: refresh ? 'merge-conflict' : 'no-verdict',
              stage: 'base-refresh',
              reason: refresh
                ? `${r.repo} ${r.branch}: merging the repaired base ${r.base} needs a judgment call: ${refresh.conflict}; the repair was not applied.`
                : `${r.repo} ${r.branch}: the base-refresh agent returned no result after a retry; the repair was not applied.`,
            })
            return null
          }
        }
        // A branch stacked on a repaired one carries the repair after the refresh above; it has no
        // decision of its own, only the validation its new base owes it.
        if (r.instructions.length === 0) {
          return repairedBase(i)
            ? { outcome: 'repaired', summary: 'carried onto its repaired base', fromSha: null }
            : { outcome: 'blocked', summary: 'its base was not repaired', reason: `its base ${r.base} was not repaired, so there was nothing to carry onto it` }
        }
        return tryTwice(repairPrompt(r), {
          label: `repair:${unitTag(r)}`,
          phase: 'Repair',
          schema: REPAIR_RESULT,
        })
      }),
    )
    batch.forEach((i, k) => {
      repairResults[i] = results[k]
      repairOrder.push(i)
      pending.delete(i)
    })
  }

  repairOrder.forEach((i) => {
    const r = repairs[i]
    const result = repairResults[i]
    if (preRefused.has(i)) {
      hil.push(preRefused.get(i))
      return
    }
    if (result && result.caveats) caveats.push(...result.caveats.map((c) => `${r.branch} repair: ${c}`))
    if (result && result.outcome === 'repaired') {
      units.push({ ...r, fromSha: result.fromSha || null })
    } else {
      hil.push({
        slug: null,
        kind: result ? 'repair' : 'no-verdict',
        stage: result ? undefined : 'repair',
        reason: result
          ? `${r.repo} ${r.branch}: ${result.reason || result.summary}`
          : `${r.repo} ${r.branch}: the repair agent died twice without a result; the worktree may hold partial work — inspect before rerunning.`,
      })
    }
  })
} else {
  // ---- Implement: waves of parallel tasks gated by depends-on, each wave merged before the next

  phase('Implement')

  // Whether a task's branch reached its target is git's knowledge, never a task-file field: the
  // merge rounds re-list every implemented task and an already-merged branch no-ops, so a run
  // interrupted between implementation and merge resumes correctly for free.
  const merged = new Set()
  const conflicted = new Set() // merge gave up on these; never retried within this run
  const taskBranch = (t) => `task/${t.slug}`
  const byRepo = (list) => {
    const groups = new Map()
    for (const t of list) {
      if (!groups.has(t.repository)) groups.set(t.repository, [])
      groups.get(t.repository).push(t)
    }
    return groups
  }

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
        operationalFiles.map((f) => `- ${f}`).join('\n') +
        `\n\nCommit nothing, stage nothing: the files sit in the user's checkout, and what goes into` +
        ` its history is the user's call.`,
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
      `   ${[task.branch, task.baseBranch, startRef(task.repository)].filter(Boolean).join(', then ')}.`,
      `   Everything this task depends on is already merged into whichever you start from. If the`,
      `   worktree already exists from an interrupted attempt, continue in it instead of recreating`,
      `   anything.`,
      `4. Implement exactly what the task's Goal and Done-when describe — nothing more. The task's`,
      `   \`## Note\` section, when it has one, is part of the task. Work only inside your worktree;`,
      `   the only file you touch outside it is the task file itself.`,
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
      `A line starting \`Consent:\` in the task's \`## Note\` is the user's own decision, recorded`,
      `verbatim: it grants exactly what it names — editing a protected path it names, an action it`,
      `approves — so do not stop for that. Anything beyond what it names still stops you.`,
      `Never edit, copy or commit the specification at ${specPath}, and never add a copy of it to the`,
      `branch: the spec changes only through \`/fd3:build-spec ${specPath}\`. A discrepancy between the`,
      `spec and what the task needs is a caveat naming that command — or, when it stops the task, the`,
      `blocked reason naming it.`,
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
          `- target ${branch} (stacks on ${g.base || startRef(repo)}, worktree ${branch === parked(repo) ? `${repo} — the main checkout` : worktreePath(repo, branch)}):\n` +
          g.tasks.map((t) => `    - ${taskBranch(t)} (task ${t.slug}, file ${t.file})`).join('\n'),
      )
      .join('\n')
    return [
      `<toolchain_report>`,
      toolchain.get(repo) || '(none — no generator is known; treat a generated file like any other)',
      `</toolchain_report>`,
      ``,
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
      `4. For every task now merged in, including one that was already up to date, set`,
      `   \`status: merged\` in the task file listed beside it, changing nothing else in that file.`,
      `   The task files are the run's state store and you never commit them, wherever they live —`,
      `   a status left at implemented after the merge is the one thing a later reader cannot tell`,
      `   from a merge that never happened.`,
      ``,
      `Resolve a merge conflict only when the two sides are clearly compatible and the resolution`,
      `is mechanical; commit the resolution and record it under resolved — the task's slug and one`,
      `line on what you chose; a resolved conflict is exactly where a later review should look.`,
      `When a conflict needs a judgment call, abort that merge (git merge --abort), record the task`,
      `under conflicts, and continue with the rest.`,
      `A conflict in a generated file — one <toolchain_report> regenerates (a schema, an`,
      `OpenAPI document, a client, an index) — is resolved by re-running its generator on the merged`,
      `sources and committing the result, never by editing the conflict markers.`,
      ``,
      ...(parked(repo) ? [checkoutRule(repo), ``] : []),
      `Return every target branch you touched with its worktree path, the slugs of the tasks now`,
      `merged in, the conflicts, and the resolved list (empty arrays when clean).`,
    ].join('\n')
  }

  const recordUnit = (repo, b, slugs) => {
    let unit = units.find((u) => u.repo === repo && u.branch === b.branch)
    if (!unit) {
      const sample = tasks.find((t) => t.repository === repo && t.branch === b.branch)
      unit = { repo, branch: b.branch, worktree: b.worktree, base: (sample && sample.baseBranch) || diffBase(repo), tasks: [] }
      units.push(unit)
    }
    for (const slug of slugs) if (!unit.tasks.includes(slug)) unit.tasks.push(slug)
  }

  // A base no task builds leaves nothing to wait for, so the task above starts immediately — right
  // for a genuine root, and indistinguishable from a mistyped branch-base, which would quietly lose
  // the stacking order the landing units rest on. Say so once, before any work starts.
  //
  // slug stays null and the task is named in the reason: every slug-bearing hil entry renders into
  // the human-owned and reservation lists, which tell the implement, fix and review agents to keep
  // off that task — and this one is still being implemented normally.
  // One item per dangling base, not per task: branch-base is identical on every task of a branch, so
  // a single typo on a six-task branch would otherwise be reported six times.
  const danglingBases = new Set()
  for (const t of tasks) {
    if (!t.baseBranch || t.repository === 'none') continue
    if (tasks.some((x) => x.repository === t.repository && x.branch === t.baseBranch)) continue
    const key = `${t.repository}:${t.baseBranch}`
    if (danglingBases.has(key) || (input.knownBases || []).includes(key)) continue
    danglingBases.add(key)
    const affected = tasks.filter((x) => x.repository === t.repository && x.baseBranch === t.baseBranch).map((x) => x.slug)
    hil.push({ slug: null, kind: 'graph', reason: `branch-base \`${t.baseBranch}\` names a branch no task in ${t.repository} builds, so ${affected.join(', ')} start from it if it already exists and as stack roots if it does not. Confirm the base exists, or fix the branch-base.` })
  }

  let wave = 0
  while (true) {
    humanOwned = humanOwnedList()

    // A dependency counts as satisfied only once its branch is in the target — done tasks
    // passed validation on a merged branch, implemented ones must have cleared a merge round.

    // A stacked branch's tasks start from its base, so the base must already carry its work — a task
    // that starts from a base that is not there yet writes against files it cannot see.
    const baseReady = (t) => {
      if (!t.baseBranch) return true
      const producers = tasks.filter((x) => x.repository === t.repository && x.branch === t.baseBranch)
      if (producers.length === 0) return true
      return producers.every((x) => status.get(x.slug) === 'done' || merged.has(x.slug))
    }

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
      (t) =>
        (status.get(t.slug) === 'implemented' || status.get(t.slug) === 'merged') &&
        !merged.has(t.slug) &&
        !conflicted.has(t.slug),
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
            // Mechanical git work: a conflict that needs judgment is aborted and reported, never resolved here.
            model: 'sonnet',
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
          for (const slug of b.mergedSlugs) {
            merged.add(slug)
            status.set(slug, 'merged')
          }
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
}

// Tasks still todo here sit behind a blocked or conflicted dependency, or a base that never
// finished; the human unblocks, the skill relaunches.
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
// A finding that asks to undo a human decision would reach the human again as a question they
// already answered, or worse, reach a fixer; a repair's own instructions are decisions too.
const decisions = input.decisions || []
const reservationsFor = (unit) => {
  const decided = [...decisions, ...(unit.instructions || [])]
  return [
    reservationLines.length > 0
      ? `Open work on this task graph — deliberately unfinished, human-owned or blocked:\n${reservationLines.join('\n')}`
      : '',
    decided.length > 0
      ? `Decisions a human made on this task graph — never undo one, and never fix toward the alternative it rejected:\n${decided.map((d) => `- ${d}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const taskFilesOf = (unit) => (repairMode ? unit.taskFiles || [] : unit.tasks.map((slug) => tasks.find((t) => t.slug === slug).file))
// The skill records a granted confirmation only in the task file, which this script cannot read; a
// fixer that never sees it reverts the consented change or skips its failure as awaiting approval.
const consentNote = (files) =>
  files.length === 0
    ? ''
    : [
        `Before your first edit, read every line starting \`Consent:\` in the \`## Note\` of this branch's task files:`,
        ...files.map((f) => `- ${f}`),
        `Each is the user's own decision, recorded verbatim, and grants exactly what it names — editing a`,
        `protected path it names, an action it approves. Never undo what one grants, and never skip a`,
        `problem as awaiting a human's approval that one already gives; anything beyond what it names`,
        `still stops you.`,
      ].join('\n')
const fixerReservations = (unit) => [reservationsFor(unit), consentNote(taskFilesOf(unit))].filter(Boolean).join('\n\n')

// ---- Validate: one branch at a time, so at most one build/lint/test pipeline runs at once

phase('Validate')

await baselineReady

const CI_RESULT = {
  type: 'object',
  required: ['passed', 'failures', 'branch', 'dirty', 'head'],
  properties: {
    passed: { type: 'boolean', description: 'true when nothing fails beyond the baseline and incomplete is empty' },
    incomplete: { type: 'array', items: { type: 'string' }, description: 'commands started but without an exit line when you returned, each with the last log line it reached — never under failures, never counted as passed' },
    failures: { type: 'array', items: { type: 'string' }, description: 'one entry per newly failing command, with the load-bearing output lines' },
    branch: { type: 'string', description: 'the branch name the prompt says to return when HEAD matches it; otherwise the branch actually checked out, or the short HEAD sha when detached' },
    dirty: { type: 'string', description: '`git -C <worktree> status --porcelain` after the last command, verbatim; an empty string when the tree is clean' },
    head: { type: 'string', description: '`git -C <worktree> rev-parse HEAD` — the commit this verdict grades' },
    preExisting: { type: 'array', items: { type: 'string' }, description: 'failures that match the baseline of the clean base — informational, never fixed on this branch' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'commands not run, each with the reason — a skip is never reported as passed' },
    marked: { type: 'boolean', description: 'the task files were set to done; asked for only when nothing after this run can withhold the mark' },
  },
}

const MARK_RESULT = {
  type: 'object',
  required: ['marked'],
  properties: { marked: { type: 'boolean', description: 'every listed task file now reads `status: done`' } },
}

const FIX_RESULT = {
  type: 'object',
  required: ['summary', 'fromSha', 'toSha'],
  properties: {
    summary: { type: 'string' },
    fromSha: { type: 'string', description: '`git rev-parse HEAD` in the worktree before the first edit' },
    toSha: { type: 'string', description: '`git rev-parse HEAD` in the worktree after the last commit; equal to fromSha when nothing was committed' },
    caveats: { type: 'array', items: { type: 'string' }, description: 'problems skipped with the reason, judgment calls that went beyond the listed problems, and any change that touches a spec decision' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'every listed problem left unfixed, copied verbatim from the list' },
  },
}

const PREP_RESULT = {
  type: 'object',
  required: ['status', 'invoked', 'files'],
  properties: {
    invoked: { type: 'boolean', description: 'the code-review:cr-prepare skill was invoked through the Skill tool' },
    status: { enum: ['ready', 'empty', 'error'] },
    files: { type: 'number', description: 'judged files' },
    skipped: { type: 'number', description: 'skipped files' },
    active: { type: 'array', items: { type: 'string' }, description: 'active lenses, by name' },
    inactive: { type: 'array', items: { type: 'string' }, description: 'inactive lenses, each with its reason' },
    alternate: { type: 'string', description: 'the alternate base and its file count; only when status is empty and the skill named one' },
    reason: { type: 'string', description: 'when status is error, or empty with a reason line' },
  },
}

const SCAN_RESULT = {
  type: 'object',
  required: ['status', 'invoked', 'filesJudged', 'filesTotal'],
  properties: {
    invoked: { type: 'boolean', description: 'the code-review:cr-scan skill was invoked through the Skill tool' },
    status: { enum: ['scanned', 'inactive', 'error'] },
    filesJudged: { type: 'number' },
    filesTotal: { type: 'number' },
  },
}

const SCAN_ALL_RESULT = {
  type: 'object',
  required: ['invoked', 'lenses'],
  properties: {
    invoked: { type: 'boolean', description: 'the code-review:cr-scan skill was invoked through the Skill tool' },
    lenses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lens', 'status', 'filesJudged', 'filesTotal'],
        properties: {
          lens: { type: 'string' },
          status: { enum: ['scanned', 'inactive', 'error'] },
          filesJudged: { type: 'number' },
          filesTotal: { type: 'number' },
        },
      },
    },
  },
}

const SEVERITIES = ['high', 'medium', 'nit', 'comment']
const FAMILIES = ['readability', 'tests', 'naming', 'module', 'objects', 'patterns', 'simplicity', 'security', 'performance', 'correctness', 'spec', 'standards', 'comments']

const CR_MERGE_RESULT = {
  type: 'object',
  required: ['status', 'invoked', 'findings'],
  properties: {
    invoked: { type: 'boolean', description: 'the code-review:cr-merge skill was invoked through the Skill tool' },
    status: { enum: ['merged', 'incomplete', 'error'] },
    report: { type: 'string', description: 'absolute path of cr-report.md' },
    unowned: { type: 'array', items: { type: 'string' }, description: 'the `unowned:` lines, verbatim: real problems no rule covers' },
    securityReview: { type: 'string', description: 'the `security-review:` line, verbatim; empty when it reads none' },
    missing: { type: 'array', items: { type: 'string' }, description: 'lenses that did not report; only when status is incomplete' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'family', 'rule', 'location', 'risk', 'fix'],
        properties: {
          severity: { enum: SEVERITIES, description: '`comment` for a comment verdict' },
          family: { enum: FAMILIES, description: '`comments` for a comment verdict' },
          rule: { type: 'string', description: 'the rule, or for a comment verdict R<n> and its verdict' },
          location: { type: 'string', description: '<path>:L<lines>' },
          risk: { enum: ['safe', 'structural', 'report-only'] },
          fix: { type: 'string' },
          reserved: { type: 'boolean', description: 'a direct consequence of the open work the prompt lists' },
          boyScout: { type: 'boolean', description: 'the finding line carries the `boy-scout` token: it is about code the change did not touch' },
          access: { type: 'boolean', description: 'a security finding whose fix changes who may reach what — a permission, a role, a policy, the scope of an auth check' },
          specBound: { type: 'boolean', description: 'the finding line says fixing it would change behaviour the spec states' },
        },
      },
    },
  },
}

// A branch that is checked out in the repository itself has no worktree of its own, and that
// checkout is the user's: their uncommitted work, and often the tasks directory, sit in the tree
// the commands would grade. Validate it in a detached worktree at the branch's commit instead —
// `git worktree add --detach` is allowed for a branch checked out elsewhere, and what it holds is
// exactly what the branch holds. Fixes still land in the checkout; the next run refreshes this one.
const validationTree = (unit) =>
  unit.worktree === unit.repo ? `${unit.repo}.worktrees/${unit.branch.replace(/\//g, '-')}-validate` : unit.worktree

const treeSetup = (unit) => {
  const tree = validationTree(unit)
  return tree === unit.worktree
    ? []
    : [
        `That worktree is this branch's validation checkout, detached at its commit. Create it`,
        `with \`git worktree add --detach ${tree} ${unit.branch}\` if it is not there; if it is,`,
        `bring it to the branch's current commit with \`git -C ${tree} checkout --detach`,
        `${unit.branch}\`. Never \`git clean\` it — installed dependencies live there untracked.`,
        ``,
      ]
}

const ciPrompt = (unit, mode, markFiles) => {
  const tree = validationTree(unit)
  return [
    `<toolchain_report>`,
    toolchainFor(unit),
    `</toolchain_report>`,
    ``,
    `<baseline>`,
    baselineText(unit.repo),
    `</baseline>`,
    ``,
    `Run the validation commands for the repository ${unit.repo}, branch ${unit.branch},`,
    `in the worktree ${tree}. Run them in the order <toolchain_report> gives, sequentially — never in`,
    `parallel. Run each one as \`<command> > ${tree}.ci.log 2>&1; echo "exit $?"\` — the log sits`,
    `beside the worktree, never inside it — read pass or fail from that exit line alone, and read`,
    `the log only for the lines a failure needs. Never pipe a command into \`tail\`, \`head\` or`,
    `\`grep\`: the pipe's status replaces the command's, and a failing suite then reads as whatever`,
    `its output happens to show. ${waitRule('list it under incomplete with the last log line it reached')}`,
    ``,
    ...treeSetup(unit),
    `\`cd ${tree}\` before anything else, and name the tree in every git command you run —`,
    `\`git -C ${tree} …\` — because the shell's working directory can reset between commands, and`,
    `a git command that silently runs in another checkout describes that checkout instead. Confirm`,
    `what you are about to grade: \`git -C ${tree} rev-parse HEAD\` must equal`,
    `\`git -C ${unit.repo} rev-parse ${unit.branch}\`; return the first as head either way. When they match,`,
    `return branch "${unit.branch}". When they do not, run nothing: return the branch you actually`,
    `found (or the short HEAD sha when detached) as branch, with passed=false and the mismatch in`,
    `failures. Every command runs from that worktree: each command's cwd in <toolchain_report> is relative`,
    `to the repository root, so resolve it there — never against ${unit.repo}, which is a`,
    `different checkout on a different branch.`,
    ...ownToolchainNote(unit),
    ``,
    mode === 'scoped'
      ? `Scope the run to this branch's changes: list them with` +
        `\n\`git diff --name-only ${unitBase(unit)}...HEAD\` — ${unitBase(unit)} is the base, never diff the` +
        `\nbranch against itself — and use each command's scoped form from <toolchain_report> on those` +
        `\npaths, quoting every path you pass to a shell (unquoted brackets and globs break zsh);` +
        `\nrun a command in full only when <toolchain_report> marks it not scopeable.`
      : `Run every command in full — this is the branch's full gate.`,
    ``,
    `Skip only what <toolchain_report> lists as not runnable here. A command <baseline> shows failing`,
    `still runs, scoped as above where <toolchain_report> gives it a scoped form: a branch can add new`,
    `failures to a command that was already red, and only this run can see them. A command`,
    `<baseline> shows with NO VERDICT is run in full here, never skipped.`,
    `Every skip goes under skipped with its reason; a skip is never reported as passed. A failure`,
    `whose location and message match <baseline> is pre-existing: return it under preExisting,`,
    `never under failures, and do not count it against the branch. Every other failure of that`,
    `command — a location or a message <baseline> does not list — is new and goes under failures.`,
    ``,
    `Do not fix anything. Editing a source file, applying a formatter, and regenerating a derived`,
    `artifact a command compares against — an index, a schema, a lockfile — are all fixing: report`,
    `the failure and leave it. A verdict is only worth what the tree it ran on was, so when the`,
    `last command has run, run \`git -C ${tree} status --porcelain\` and return its output`,
    `verbatim as dirty.`,
    `Return passed=true only when incomplete is empty and every runnable command exits 0 or fails`,
    `only on <baseline> entries; otherwise return each newly failing command with the output lines that matter.`,
    ...(markFiles
      ? [
          ``,
          `One thing beyond the commands. When — and only when — you return passed=true, incomplete`,
          `is empty and dirty lists nothing but these task files, set \`status: done\` in their frontmatter, changing`,
          `nothing else in them, and return marked=true:`,
          ...taskFilesOf(unit).map((f) => `- ${f}`),
          `They are this run's state store, and the no-fixing rule above is about the code, not`,
          `about them: edit them at the absolute paths listed, commit nothing, and if they happen`,
          `to sit inside a checkout of this repository, leave that checkout's other files alone.`,
          `On any failure leave them untouched and return marked=false.`,
        ]
      : []),
  ].join('\n')
}

// A delta review reads an implement run's review fixes; nothing reads a repair's, so the two fixers
// are told different things about their commits.
const REVIEW_FIX = repairMode ? 'review' : 'code-review'

const fixPrompt = (unit, problems, source, preExisting = []) =>
  [
    `<toolchain_report>`,
    toolchainFor(unit),
    `</toolchain_report>`,
    ``,
    `Fix ${source} problems on branch ${unit.branch} in the worktree ${unit.worktree}`,
    `(repository ${unit.repo}). Problems:`,
    ``,
    ...problems.map((p) => `- ${p}`),
    ``,
    ...(fixerReservations(unit) ? [fixerReservations(unit), ``] : []),
    ...(preExisting.length > 0
      ? [`Already failing on the clean base — never this branch's to fix, even where a listed problem points at it:`, ...preExisting.map((p) => `- ${p}`), ``]
      : []),
    `Fix only what is listed — no refactoring, no drive-by changes, and never touch problems`,
    ...(repairMode
      ? [`that pre-date this branch.`]
      : [`that pre-date this branch. The open work above is deliberate: never do it and never fill`, `the gaps it leaves.`]),
    `A listed problem that cannot be fixed without an action a human must`,
    `take or approve — anything that touches production, anything irreversible, any secret or`,
    `credential, generating a migration, and whatever this repository's own rules reserve — is a`,
    `blocker, not a fix: skip it and record it under caveats. Never guess your way past it.`,
    `A failure the fix can only clear by changing behaviour — an exception carved out of a rule,`,
    `a narrowed decision, an error that stops meaning what it meant — is a design call, not a fix:`,
    `skip it and record under caveats what the choice is.`,
    `A listed failure in a file this branch did not change (\`git diff --name-only ${unitBase(unit)}...HEAD\`)`,
    `that no change of the branch explains is not this branch's either: skip it and record it under`,
    `caveats as out of scope — a fix there edits code the branch was never about.`,
    `Never edit, copy or commit ${specRef}: a problem that needs the spec`,
    `changed is skipped and recorded under caveats naming \`/fd3:build-spec ${specArg}\`, the only`,
    `route by which the spec changes.`,
    ``,
    ...(unit.worktree === unit.repo ? [checkoutRule(unit.repo), ``] : []),
    `When a fix changes something a command in <toolchain_report> derives an artifact from,`,
    `regenerate that artifact the way the report says.`,
    ``,
    `Before your first edit, run \`git rev-parse HEAD\` in the worktree and return it as fromSha.`,
    `After your last commit, run it again and return that as toSha — equal to fromSha when you`,
    `committed nothing.`,
    `Commit the fixes with a conventional-commit message, staging the files you changed by name —`,
    `never \`git add -A\`: the tree also holds what the validation commands wrote. To verify a fix`,
    `you may re-run the exact commands that failed, scoped to the files they failed on — never a`,
    `whole suite; the full validation runs after you. ${waitRule('say so under caveats')}`,
    `A listed failure that does not reproduce when you re-run it is not yours to fix: commit nothing`,
    `for it and say so under caveats, with the exit line you saw.`,
    ``,
    `Return a two-sentence summary. Under caveats, return every problem you skipped with the`,
    `reason, any judgment call that went beyond the listed problems, and any change that touches`,
    `a decision recorded in the spec.`,
    `A caveat says something the parent could not otherwise know. Following this prompt is not a`,
    `caveat.`,
    `Make every edit with the Edit tool — never \`sed -i\`, a Python or heredoc rewrite, or any`,
    `script that rewrites a file: a scripted rewrite changes lines nobody asked for, and the review`,
    `that follows reads them as new code.`,
    ...(source === REVIEW_FIX
      ? [
          `Under skipped, also copy verbatim every listed problem you left unfixed, whatever the reason.`,
          ...(repairMode
            ? [`Each listed problem sits in the repair's own change; a fix that reaches beyond it is skipped.`]
            : [
                ``,
                `A site a listed problem names by location is part of it even where it pre-dates this branch: a`,
                `duplication finding lists every copy, and fixing it means fixing each copy it names — never a`,
                `copy it does not name.`,
                `A name you add says what the code does, not where it sends it, and reuses no name the module`,
                `already exports. A value two modules need moves to a module both already import (constants,`,
                `config) — never import it from a repository, an adapter or an app-composition file: each`,
                `such fix came back as the next review's dependency-direction finding.`,
              ]),
          `Commit each \`security\` finding's fix on its own, naming its rule in the message, so one can be`,
          `reverted without the rest; the other fixes share a commit. Every commit message names the`,
          `findings it fixes, by rule and location: ${
            repairMode
              ? 'no review reads these fixes after you, so the history is their only record.'
              : 'that is how the delta review knows the change is a fix round, which it judges as it stands rather than undoing.'
          }`,
        ]
      : []),
  ].join('\n')

// The lens skills read a context directory, never this prompt, so the run's own facts — which tree,
// which base, what is deliberately unfinished — reach them only through the wrapper agents.
const reviewDir = (unit, pass) => `${unit.repo}.worktrees/.review/${unit.branch.replace(/\//g, '-')}-${pass}`

// cr-prepare takes no lens filter, and cr-merge reports any active lens without a file as missing,
// so the review is narrowed in the context it writes.
const narrowRule = (dir, only) =>
  only
    ? [
        ``,
        `When the skill returns status "ready", narrow the review to the ${only.join(' and ')} lenses: in`,
        `${dir}/scope.json, move every entry of \`lenses.active\` naming another lens to \`lenses.inactive\``,
        `as { "lens": <its name>, "reason": "not judged on a repair" }, changing nothing else in the file.`,
        `Then return active and inactive as the file reads after that edit. Run no lens yourself.`,
      ]
    : []

// The element and decision codes live in task frontmatter, which the script never sees, so the
// prepare agent reads them; codes without a spec to resolve them against are noise.
const specFocusRule = (files) =>
  specPath && files.length > 0
    ? [
        ``,
        `Before invoking it, read the \`elements:\` and \`decisions:\` frontmatter lists of these task files:`,
        ...files.map((f) => `- ${f}`),
        `Append \`--spec-focus "<codes>"\` to the arguments above, with every code those lists carry, each`,
        `once, joined by commas. When every list is empty, append nothing.`,
      ]
    : []

const prepPrompt = (unit, base, dir, only) => {
  const tree = validationTree(unit)
  return [
    `Prepare a code review of the branch ${unit.branch} (repository ${unit.repo}) in the checkout`,
    `${tree}, measured from ${base}.`,
    ``,
    ...treeSetup(unit),
    `\`git -C ${tree} rev-parse HEAD\` must equal \`git -C ${unit.repo} rev-parse ${unit.branch}\`;`,
    `when it does not, invoke nothing and return status "error" with the mismatch as reason.`,
    ``,
    `Remove ${dir} if it exists — lens files left there by an earlier run would be read as this`,
    `run's. Then invoke the \`code-review:cr-prepare\` skill through the Skill tool with:`,
    `\`--base ${base} --out ${dir} -C ${tree}${specPath ? ` --spec ${specPath}` : ''}\``,
    ...specFocusRule(taskFilesOf(unit)),
    ``,
    `Return what its closing block says: status, judged and skipped file counts, active and inactive`,
    `lenses, the alternate or reason on empty, the reason on error — and invoked=true. When the Skill tool is not`,
    `available to you, return invoked=false, status "error" and zero files; never do the skill's work by hand.`,
    ...narrowRule(dir, only),
  ].join('\n')
}

const scanPrompt = (lens, dir) =>
  [
    `Invoke the \`code-review:cr-scan\` skill through the Skill tool with`,
    `\`--lens ${lens} --context ${dir}\`, and return what its closing block says — status, files`,
    `judged of the total — with invoked=true. When the Skill tool is not available to you, return`,
    `invoked=false, status "error" and zero counts; never judge the change by hand.`,
  ].join('\n')

const scanAllPrompt = (lenses, dir) =>
  [
    `Invoke the \`code-review:cr-scan\` skill through the Skill tool once, with`,
    `\`--lens ${lenses.join(',')} --context ${dir}\`. It judges each listed lens in turn and prints one`,
    `closing block per lens. Return one entry under lenses per closing block — the lens it names, its`,
    `status, files judged of the total — with invoked=true. When the Skill tool is not available to`,
    `you, return invoked=false and no lenses; never judge the change by hand.`,
  ].join('\n')

// Every scan agent pays a fixed start-up cost — the skill, the context, the diff — which on a change
// this small outweighs each lens's own judging, so one agent runs every lens.
const SINGLE_SCAN_MAX_FILES = 3

// The scanner agent carries the lens's narrowed tool set and loads no CLAUDE.md, so the conventions
// note cr-prepare wrote is the only house style a lens judges by.
const SCANNER = 'code-review:scanner'

const lensDead = (r) => !r || !r.invoked || r.status === 'error' || (r.status === 'scanned' && r.filesTotal > 0 && r.filesJudged === 0)
// A lens that read some of its files still reported, but its silence on the rest is not a verdict.
const lensPartial = (r) => r.status === 'scanned' && r.filesJudged > 0 && r.filesJudged < r.filesTotal

// Returns the lenses that did not report — a lens the single scanner left out of its list is one —
// and those that judged only part of their files.
const scanLenses = async (lenses, dir, files, tag, pass) => {
  let results
  if (lenses.length > 1 && files <= SINGLE_SCAN_MAX_FILES) {
    const r = await tryTwice(scanAllPrompt(lenses, dir), { agentType: SCANNER, label: `cr:${tag}:${pass}:all`, phase: 'Validate', schema: SCAN_ALL_RESULT })
    const reported = new Map((r && r.invoked ? r.lenses || [] : []).map((e) => [norm(e.lens), { ...e, invoked: true }]))
    results = lenses.map((l) => reported.get(l))
  } else {
    results = await parallel(
      lenses.map((lens) => () =>
        tryTwice(scanPrompt(lens, dir), { agentType: SCANNER, label: `cr:${tag}:${pass}:${lens}`, phase: 'Validate', schema: SCAN_RESULT }),
      ),
    )
  }
  const dead = lenses.filter((_, i) => lensDead(results[i]))
  const partial = lenses
    .map((lens, i) => ({ lens, r: results[i] }))
    .filter(({ r }) => !lensDead(r) && lensPartial(r))
    .map(({ lens, r }) => `lens ${lens} judged ${r.filesJudged} of ${r.filesTotal} files`)
  return { dead, partial }
}

const crMergePrompt = (dir, unit) =>
  [
    `Invoke the \`code-review:cr-merge\` skill through the Skill tool with \`--context ${dir}\`,`,
    `and return what its closing block says: status, the report path, the lenses that did not`,
    `report on incomplete, and every finding line as one entry — severity, family, rule, location,`,
    `risk class and the fix. A comment verdict's severity is \`comment\`; a line carrying the`,
    `\`boy-scout\` token sets boyScout=true, and a security finding whose fix changes who may reach`,
    `what — a permission, a role, a policy, an auth check's scope — sets access=true. A finding whose`,
    `line says its fix would change behaviour the spec states sets specBound=true. Copy every`,
    `\`unowned:\` line verbatim as one entry under unowned, and the \`security-review:\` line's text`,
    `as securityReview, empty when either reads none. Return invoked=true; when`,
    `the Skill tool is not available to you, return invoked=false, status "error" and no findings.`,
    ...(reservationsFor(unit)
      ? [
          ``,
          reservationsFor(unit),
          ``,
          ...(repairMode
            ? [`Set reserved=true on a finding that asks to undo a listed decision. Change nothing else the skill returned.`]
            : [
                `Set reserved=true on a finding that is this open work or its direct consequence — a gap a`,
                `blocked or human-owned task deliberately leaves — or that asks to undo a listed decision.`,
                `Change nothing else the skill returned.`,
              ]),
        ]
      : []),
  ].join('\n')

// Agents echo review tokens as they read them — backticked, padded, capitalised — and an exact
// comparison then lets a security or spec finding past the filters below.
const norm = (s) => String(s ?? '').replace(/`/g, '').trim().toLowerCase()

// A review that did not run is absence of evidence: a lens that judged nothing or a skill the agent
// never invoked comes back as a reason, never as an empty findings list. `only` narrows the review
// to those lenses.
const runReview = async (unit, base, pass, tag, only) => {
  const dir = reviewDir(unit, pass)
  const prep = await tryTwice(prepPrompt(unit, base, dir, only), { label: `cr-prep:${tag}:${pass}`, phase: 'Validate', schema: PREP_RESULT, model: 'sonnet' })
  if (!prep || !prep.invoked || prep.status === 'error') {
    return { dir, dead: `cr-prepare ${prep ? `failed: ${prep.reason || 'the skill was not invoked'}` : 'returned no result after a retry'}` }
  }
  if (prep.status === 'empty') {
    // An alternate base says the diff was measured from the wrong ref, which a human settles. A
    // change with nothing a lens could judge is not a dead review: holding the branch on it would
    // keep its task files from done on every relaunch.
    // A diff with no file at all is how a base equal to the branch shows itself, so only a change
    // whose files review skips is not applicable.
    if (prep.alternate || !(prep.skipped > 0)) {
      return { dir, empty: true, alternate: prep.alternate, dead: `the change against ${base} is empty${prep.alternate ? ` (the skill names ${prep.alternate})` : ''}` }
    }
    return { dir, empty: true, notApplicable: `review not applicable: every changed file against ${base} (${prep.skipped}) is skipped by review` }
  }
  // The lens name goes into a label and a backticked skill argument, so it travels normalised.
  const all = (prep.active || []).map(norm)
  // A lens outside the narrowed set that is still active fails at cr-merge as missing, which is the
  // honest outcome: its scope.json was not narrowed.
  const lenses = only ? all.filter((l) => only.includes(l)) : all
  // None of the narrowed lenses applies — an all-skipped change the spec lens alone would read — so
  // the caller's own checks are the review.
  if (only && lenses.length === 0) return { dir, files: prep.files || 0, lenses: 0, findings: [], notices: [] }
  // cr-prepare keeps an all-skipped change ready when a spec is given, with the spec lens alone
  // reading the skipped paths: zero judged files is then a real review, not an empty one.
  const specOnly = lenses.length > 0 && lenses.every((l) => l === 'spec')
  // A prepare that judged nothing leaves the lenses nothing to read, and their empty reports would
  // merge into a clean review of a change nobody looked at.
  if (lenses.length === 0 || (!(prep.files > 0) && !specOnly)) {
    return { dir, dead: `cr-prepare reported ready with ${prep.files > 0 ? 'no active lens' : 'no judged file'}` }
  }
  const scan = await scanLenses(lenses, dir, prep.files || 0, tag, pass)
  if (scan.dead.length > 0) return { dir, dead: `lens ${scan.dead.join(', ')} did not report` }
  const merged = await tryTwice(crMergePrompt(dir, unit), { label: `cr-merge:${tag}:${pass}`, phase: 'Validate', schema: CR_MERGE_RESULT })
  if (!merged || !merged.invoked || merged.status !== 'merged') {
    const why = !merged
      ? 'returned no result after a retry'
      : merged.status === 'incomplete'
        ? `found lens ${(merged.missing || []).join(', ')} missing`
        : 'failed'
    return { dir, dead: `cr-merge ${why}` }
  }
  return {
    dir,
    report: merged.report || `${dir}/cr-report.md`,
    files: prep.files || 0,
    lenses: lenses.length,
    findings: merged.findings,
    notices: [
      ...scan.partial,
      ...(merged.unowned || []).map((u) => `${u} — a real problem no review rule covers`),
      ...(merged.securityReview ? [`run /security-review: ${merged.securityReview}`] : []),
    ],
  }
}

// A spec finding is work the spec never asked for, and a report-only one has no fix to apply — both
// go to a human in either mode. Unattended runs fix the rest: holding every security fix and
// boy-scout finding for a yes stopped each branch on a human. Gated keeps that hold for a user who
// wants to walk security fixes one at a time; a boy-scout fix that is not mechanically safe is
// reported either way, since it edits code the task never touched. A security fix that changes who
// may reach what is a policy call, and a fix that would change behaviour the spec states — the
// correctness lens marks those — is the spec owner's call; both wait for a human in either mode.
// Nits and the remaining comment
// verdicts are reported, never applied unasked.
const serious = (f) => norm(f.severity) === 'high' || norm(f.severity) === 'medium'
const fixable = (f) =>
  !f.specBound &&
  (gated
    ? norm(f.risk) !== 'report-only' && norm(f.family) !== 'security' && norm(f.family) !== 'spec' && !f.boyScout
    : norm(f.risk) !== 'report-only' && norm(f.family) !== 'spec' && (!f.boyScout || norm(f.risk) === 'safe') && !f.access)
const isKeep = (f) => norm(f.severity) === 'comment' && /\bkeep\b/.test(norm(f.rule))
// A comment move is structural, so it is never applied unasked; with no severity it would
// otherwise fall to the report list nobody acts on.
const needsHuman = (f) => serious(f) || (norm(f.severity) === 'comment' && norm(f.risk) === 'structural')
const sortFindings = (findings) => {
  const live = findings.filter((f) => !f.reserved && !isKeep(f))
  const applied = live.filter(
    (f) => (serious(f) && fixable(f)) || (norm(f.severity) === 'comment' && norm(f.risk) === 'safe' && !(gated && f.boyScout)),
  )
  const forHuman = live.filter((f) => !applied.includes(f) && needsHuman(f))
  const reported = live.filter((f) => !applied.includes(f) && !forHuman.includes(f))
  return { applied, forHuman, reported, reserved: findings.filter((f) => f.reserved).length }
}
// A safe fix in the repair's own hunks is applied in the same run; everything else reaches a human,
// and nothing the fixer writes is reviewed again — that review is what made repairs spiral. The merge
// contract never rates a security fix safe; one a lens mislabels still never goes in unreviewed.
const repairFixable = (f) =>
  serious(f) && norm(f.risk) === 'safe' && !f.boyScout && !f.specBound && !f.access && norm(f.family) !== 'security'
const findingLine = (f) => `${f.location} — ${f.family} · ${f.rule} (${f.severity}): ${f.fix}`
// Where a held branch's task files stand: an implement branch's at merged, a repaired branch's at
// whatever the skill reset them to before the launch.
const keptStatus = repairMode ? 'the task files keep their status' : 'the branch keeps status merged'
const heldNote = gated ? `${keptStatus} until a repair settles it` : 'left for the end-of-run decision; the branch is not held on it'

// A repair is a few lines a human decided; the craft lenses returned comment churn on it that fed
// the next repair, so only the lenses that catch a real defect read it.
const REPAIR_LENSES = ['correctness', 'security']

const CONFORMANCE_RESULT = {
  type: 'object',
  required: ['checked', 'findings'],
  properties: {
    checked: { type: 'boolean', description: 'you read the whole repair diff' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'rule', 'location', 'risk', 'fix', 'decision'],
        properties: {
          severity: { enum: ['high', 'medium', 'nit'] },
          rule: { enum: ['unasked', 'missing'] },
          location: { type: 'string', description: '<path>:L<lines>' },
          risk: { enum: ['safe', 'structural'] },
          fix: { type: 'string', description: 'the fix, as one clause' },
          decision: { type: 'string', description: 'the decision this finding is about, quoted; "none" for an unasked hunk no decision is near' },
        },
      },
    },
  },
}

// CI proves a repair builds and the lenses that it is sound; only a reader holding the decisions
// can say whether it did what was decided and nothing else.
const conformancePrompt = (unit, base, ciFixes, baseMerged) => {
  const foreign = [
    ...(baseMerged ? [`a merge of the base branch ${unit.base} and its CI fixes`] : []),
    ...(ciFixes.length > 0 ? [`the CI fixes made on this branch after the repair (${ciFixes.join(', ')})`] : []),
  ]
  return [
    `Check one repair against the decisions it was made to apply: the branch ${unit.branch} of the`,
    `repository ${unit.repo}.`,
    ``,
    `A human decided:`,
    ...unit.instructions.map((x) => `- ${x}`),
    ``,
    `The repair is \`git -C ${unit.worktree} diff ${base}..HEAD\`: read all of it. Read the code around`,
    `a hunk in the worktree ${unit.worktree} only where the hunk needs it. Do not read the spec. Judge conformance alone — whether the diff does what the`,
    `decisions ask and nothing else; style, naming, tests and design quality are another reviewer's.`,
    ...(foreign.length > 0
      ? [
          `The range also holds commits the repair agent did not write — ${foreign.join(', and ')}. They`,
          `made the repaired branch pass its gate: never report their hunks as unasked.`,
        ]
      : []),
    ``,
    `Report each place where:`,
    `- unasked: a hunk no decision above asks for. A change a decision needs in order to work — an`,
    `  import, an updated caller, a test following the changed code, a regenerated artifact — is asked`,
    `  for by that decision.`,
    `- missing: a decision, or a part of one, the diff does not carry out.`,
    `Severity is high when the gap or the unasked change alters behaviour, medium when it does not, nit`,
    `for a whitespace- or format-only hunk. Risk is safe when the fix is mechanical and stays inside the`,
    `repair's own hunks — reverting an unasked hunk, finishing a change at the places the decision`,
    `names — and structural when it needs a design call. Give the location as <path>:L<lines>, the fix`,
    `as one clause, and the decision quoted.`,
    ``,
    `Change nothing and commit nothing. Return checked=true with the findings — an empty list when the`,
    `diff does exactly what was decided.`,
  ].join('\n')
}

const conformanceFinding = (f) => ({ severity: f.severity, family: 'conformance', rule: f.rule, location: f.location, risk: f.risk, fix: f.fix })

// A CI verdict is a statement about one tree at one commit. A runner that stayed in the
// repository's main checkout graded another branch's code, and one that edited its way to green
// graded a state no commit holds — both are absence of evidence, never a pass.
const porcelainPath = (line) => {
  const p = line.length > 3 ? line.slice(3) : ''
  const renamed = p.indexOf(' -> ')
  return (renamed === -1 ? p : p.slice(renamed + 4)).replace(/^"|"$/g, '')
}
// The task files are the run's state store and the CI agent itself flips them to done, so their
// own dirtiness is expected — every task file of the graph under implement, the branch's own under
// repair. So is whatever the commands write into a clean tree — the baseline recorded it — and
// voiding a verdict over a cache file voided every verdict in such a repository.
// A new untracked file cannot turn a tracked check green on its own; a tracked edit can.
const taskFilePaths = new Set(tasks.map((t) => t.file))
const stateFiles = (unit) => (repairMode ? new Set(taskFilesOf(unit)) : taskFilePaths)
const strayChanges = (dirty, unit) => {
  const own = stateFiles(unit)
  const tree = validationTree(unit)
  const toolDirt = new Set((baseline.get(unit.repo) && baseline.get(unit.repo).dirty) || [])
  const tracked = []
  const untracked = []
  const prose = []
  for (const line of (dirty || '').split('\n')) {
    if (!line.trim()) continue
    // A runner that returned prose here never captured the status, so no path in it is real.
    if (!/^[ MTADRCU?!]{2} /.test(line)) {
      prose.push(line.trim())
      continue
    }
    const p = porcelainPath(line)
    if (!p || own.has(`${tree}/${p}`) || toolDirt.has(p)) continue
    ;(line.startsWith('??') ? untracked : tracked).push(p)
  }
  return { tracked, untracked, prose }
}

const ciFault = (ci, unit) => {
  const ran = (ci.branch || '').trim()
  if (ran && ran !== unit.branch) return `ran in a checkout on ${ran} instead of ${unit.branch}`
  if (!ran) return `could not name the branch it ran on`
  const changes = strayChanges(ci.dirty, unit)
  if (changes.prose.length > 0) return `did not capture \`git status --porcelain\` (dirty reads "${changes.prose[0].slice(0, 120)}")`
  const stray = changes.tracked
  if (stray.length > 0) {
    const shown = stray.slice(0, 5).join(', ')
    return `left ${stray.length} uncommitted change(s) in the worktree (${shown}${stray.length > 5 ? ', …' : ''}), so its verdict describes a tree no commit holds`
  }
  return null
}

// The runner marks the files before the workflow judges its verdict, so a discarded verdict must
// take its marks back — a task reading done on a tree nobody validated is a lie in the state store.
const unmark = (files, label) =>
  tryTwice(
    `Set \`status: merged\` in the frontmatter of these task files, changing nothing else, and commit nothing:\n` +
      files.map((f) => `- ${f}`).join('\n'),
    { label: `unmark:${label}`, phase: 'Validate', model: 'haiku', effort: 'low' },
  )

const unfinished = (ci) => (ci && ci.incomplete) || []

// A full verdict that still describes the branch's HEAD only lacks the marks; re-running the whole
// pipeline to flip frontmatter was most of a unit's serial CI time.
const markDone = async (unit, tag) => {
  const r = await tryTwice(
    `Set \`status: done\` in the frontmatter of these task files, changing nothing else, and commit nothing:\n` +
      taskFilesOf(unit).map((f) => `- ${f}`).join('\n') +
      `\n\nReturn marked=true once every listed file reads \`status: done\`.`,
    { label: `mark:${tag}`, phase: 'Validate', schema: MARK_RESULT, model: 'haiku', effort: 'low' },
  )
  return !!(r && r.marked)
}

const runCi = async (unit, mode, markFiles, label) => {
  const files = taskFilesOf(unit)
  let ci = await tryTwice(ciPrompt(unit, mode, markFiles), { label, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  // An unfinished command is neither verdict: one more runner gets the chance to wait it out, and
  // a second one that cannot is a missing verdict, never a failure for the fix rounds to chase.
  if (unfinished(ci).length > 0) {
    if (ci.marked) await unmark(files, label)
    caveats.push(`${unit.branch} ${label}: the runner returned before ${unfinished(ci).join('; ')} finished; re-dispatched once`)
    ci = await tryTwice(ciPrompt(unit, mode, markFiles), { label: `${label}:unfinished`, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  }
  if (!ci) return { ci: null, fault: null }
  const fault = unfinished(ci).length > 0 ? `returned while ${unfinished(ci).join('; ')} had no exit line` : ciFault(ci, unit)
  const untracked = strayChanges(ci.dirty, unit).untracked
  if (!fault && untracked.length > 0) {
    caveats.push(`${unit.branch} ${label}: the run left new untracked files (${untracked.slice(0, 5).join(', ')}${untracked.length > 5 ? ', …' : ''}); the verdict stands, but a snapshot or fixture written there was never checked`)
  }
  if (fault && ci.marked) await unmark(files, label)
  return { ci, fault }
}

const TOOLCHAIN_TOUCH_RESULT = {
  type: 'object',
  required: ['touched'],
  properties: {
    touched: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' }, description: 'the changed paths that define how the repository is validated' },
  },
}

// A toolchain scouted on the base cannot see the checks a branch brings in: a repository this run
// bootstraps is scouted with install and build alone, and its branches then pass without the lint,
// typecheck and test steps they added. A branch that touches what defines validation is re-scouted
// on its own tree, and a branch stacked on it inherits that report. A repaired branch is measured
// from the default branch, so a stack whose root brought those checks in is re-scouted on the tree
// under repair.
const unitToolchain = new Map()
const unitKey = (repo, branch) => `${repo}\n${branch}`
const toolchainFor = (unit) => {
  for (let u = unit, seen = 0; u && seen < 32; seen += 1) {
    const own = unitToolchain.get(unitKey(u.repo, u.branch))
    if (own) return own
    u = units.find((x) => x !== u && x.repo === u.repo && x.branch === u.base)
  }
  return toolchain.get(unit.repo)
}

const rescoutIfTouched = async (unit, tag) => {
  const tree = validationTree(unit)
  const touch = await tryTwice(
    [
      ...treeSetup(unit),
      `List what the branch ${unit.branch} changed: \`git -C ${tree} diff --name-only ${repairMode ? diffBase(unit.repo) : unit.base}...HEAD\`.`,
      `Return touched=true when any listed path defines how the repository is validated — a CI`,
      `configuration (\`.github/workflows/*\`, \`.gitlab-ci.yml\` and the like), a package manifest whose`,
      `scripts changed, a workspace or build-orchestrator config, a lint, format, typecheck or test`,
      `config, a Makefile or task runner file — and list those paths under files. A lockfile, or a`,
      `manifest whose only change is its dependencies, does not count: it changes no check. Change nothing.`,
    ].join('\n'),
    { label: `toolchain-touch:${tag}`, phase: 'Validate', schema: TOOLCHAIN_TOUCH_RESULT, model: 'haiku', effort: 'low' },
  )
  if (!touch || !touch.touched) return
  const report = await tryTwice(
    `Repository to analyse: ${tree}\n` +
      `This is a worktree of ${unit.repo} on the branch ${unit.branch}, which changed ${(touch.files || []).join(', ')}.\n` +
      `Detect how this tree is validated and return your full report.`,
    { agentType: 'fd3:toolchain-scout', label: `scout:${tag}`, phase: 'Validate' },
  )
  if (report) unitToolchain.set(unitKey(unit.repo, unit.branch), report)
  else caveats.push(`${unit.branch}: the branch changed ${(touch.files || []).join(', ')}, but its re-scout returned no result; it was validated with the base's toolchain report.`)
}

// Returns why the review has no verdict (dead), whether its findings hold the branch for a human
// (held), and the HEAD its fixer left (head, only when a fixer ran).
const reviewImplemented = async (unit, tag, summary) => {
  let dead = null
  let held = false
  const outcome = {}
  const first = await runReview(unit, unit.base, 'review', tag)
  summary.review = { context: first.dir, report: first.report || null }
  if (first.dead) {
    dead = `the review did not run: ${first.dead}`
  } else if (first.notApplicable) {
    summary.review.notApplicable = first.notApplicable
  } else {
    const sorted = sortFindings(first.findings)
    const notices = [...first.notices]
    summary.reviewFindings = first.findings.length
    summary.findings = [...sorted.applied, ...sorted.forHuman, ...sorted.reported].map(findingLine)
    Object.assign(summary.review, { applied: sorted.applied.length, forHuman: sorted.forHuman.length, reported: sorted.reported.length, reserved: sorted.reserved })
    if (sorted.applied.length > 0) {
      const fix = await tryTwice(fixPrompt(unit, sorted.applied.map(findingLine), REVIEW_FIX), { label: `fix-cr:${tag}`, phase: 'Validate', schema: FIX_RESULT })
      if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-cr: ${c}`))
      outcome.head = (fix && fix.toSha) || null
      // A finding the fixer declined is still open, and the delta review cannot see it: it only
      // reads what the fixer changed.
      const declined = (fix && fix.skipped) || []
      const unfixed = sorted.applied.filter((f) => declined.includes(findingLine(f)))
      sorted.forHuman.push(...unfixed)
      const unmatched = declined.filter((line) => !unfixed.some((f) => findingLine(f) === line))
      for (const line of unmatched) {
        hil.push({ slug: null, kind: 'review', reason: `${unit.repo} ${unit.branch}: ${line} — the fixer left it unfixed; ${heldNote}` })
      }
      if (gated && unmatched.length > 0) held = true
      // The fixes are new code nobody has reviewed; one delta pass, whose findings go to a human —
      // a second fixer round would need a third review, and the loop has to end somewhere.
      if (!fix || !fix.fromSha) {
        dead = `the review fixes have no verdict: the fix agent ${fix ? 'did not report its starting commit' : 'returned no result after a retry'}`
      } else {
        const delta = await runReview(unit, fix.fromSha, 'delta', tag)
        summary.review.delta = { context: delta.dir, report: delta.report || null }
        if (delta.dead && !delta.empty) {
          dead = `the delta review of the fixes did not run: ${delta.dead}`
        } else if (!delta.empty) {
          const d = sortFindings(delta.findings)
          const open = [...d.applied, ...d.forHuman]
          summary.review.delta.findings = open.length
          sorted.forHuman.push(...open)
          notices.push(...(delta.notices || []))
        }
      }
    }
    for (const f of sorted.forHuman) {
      hil.push({ slug: null, kind: 'review', reason: `${unit.repo} ${unit.branch}: ${findingLine(f)} — ${heldNote}` })
    }
    for (const n of notices) hil.push({ slug: null, kind: 'review', reason: `${unit.repo} ${unit.branch}: ${n} — ${heldNote}` })
    held = held || (gated && sorted.forHuman.length + notices.length > 0)
  }
  return { ...outcome, dead, held }
}

// A repair is new code written to a human's one-line decision; CI proves it builds, never that it
// did only what was decided — the review reads the repair's own commits, and a human reads that.
const reviewRepaired = async (unit, tag, summary, reviewFrom, ciFixes, baseMerged) => {
  let dead = null
  let held = false
  const outcome = {}
  if (!unit.fromSha) {
    dead = 'the repair agent did not report its starting commit, so the repair delta is unknown'
  } else {
    const delta = await runReview(unit, reviewFrom, 'repair', tag, REPAIR_LENSES)
    summary.review = { context: delta.dir, report: delta.report || null }
    // A repair that reports a decision applied yet changed nothing against its starting commit
    // left the decision off the branch, so marking its task files would close work never done.
    if (delta.dead && delta.empty && !delta.alternate) {
      dead = `the repair reported the decision applied but committed nothing since ${unit.fromSha}`
    } else if (delta.dead) {
      dead = `the review of the repair did not run: ${delta.dead}`
    } else {
      if (delta.notApplicable) summary.review.notApplicable = delta.notApplicable
      const conformance = await tryTwice(conformancePrompt(unit, reviewFrom, ciFixes, baseMerged), { label: `conformance:${tag}`, phase: 'Validate', schema: CONFORMANCE_RESULT })
      if (!conformance || !conformance.checked) {
        dead = `the decision-conformance check ${conformance ? 'did not read the repair' : 'returned no result after a retry'}`
      } else {
        // Pre-existing code in a touched file is listed apart: offering it as open review work
        // turns every repair into the next repair's input.
        const findings = [...conformance.findings.map(conformanceFinding), ...(delta.findings || [])]
        const notices = delta.notices || []
        const live = findings.filter((f) => !f.reserved && !isKeep(f))
        const own = live.filter((f) => !f.boyScout)
        const applied = own.filter(repairFixable)
        const open = own.filter((f) => !applied.includes(f) && needsHuman(f))
        summary.review.findings = own.map(findingLine)
        summary.review.boyScout = live.filter((f) => f.boyScout).map(findingLine)
        summary.review.applied = 0
        if (applied.length > 0) {
          const fix = await tryTwice(fixPrompt(unit, applied.map(findingLine), REVIEW_FIX), { label: `fix-review:${tag}`, phase: 'Validate', schema: FIX_RESULT })
          if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-review: ${c}`))
          outcome.head = (fix && fix.toSha) || null
          const declined = fix ? fix.skipped || [] : applied.map(findingLine)
          const unfixed = applied.filter((f) => declined.includes(findingLine(f)))
          open.push(...unfixed)
          summary.review.applied = applied.length - unfixed.length
          for (const line of declined.filter((l) => !unfixed.some((f) => findingLine(f) === l))) {
            hil.push({ slug: null, kind: 'review', reason: `${unit.repo} ${unit.branch}: ${line} — the fixer left it unfixed; ${heldNote}` })
            if (gated) held = true
          }
        }
        for (const f of open) {
          hil.push({ slug: null, kind: 'review', reason: `${unit.repo} ${unit.branch}: ${findingLine(f)} — ${heldNote}` })
        }
        for (const n of notices) hil.push({ slug: null, kind: 'review', reason: `${unit.repo} ${unit.branch}: ${n} — ${heldNote}` })
        held = held || (gated && open.length + notices.length > 0)
      }
    }
  }
  return { ...outcome, dead, held }
}

const validation = [] // per-branch summary for the final report

for (const unit of units) {
  const tag = unitTag(unit)
  const summary = repairMode
    ? { repo: unit.repo, branch: unit.branch, ci: 'pending', fixRounds: 0, preExisting: 0 }
    : { repo: unit.repo, branch: unit.branch, ci: 'pending', fixRounds: 0, reviewFindings: 0, findings: [], preExisting: 0 }
  validation.push(summary)

  if (!toolchain.get(unit.repo)) {
    summary.ci = 'no-verdict' // the scout's death is already on the HIL list, once per repository
    continue
  }

  // A stacked branch may predate fixes its base received during the base's own validation;
  // validating against a stale base re-finds the base's problems and re-fixes them divergently.
  let reviewFrom = unit.fromSha
  let baseMerged = false
  if (units.some((u) => u !== unit && u.repo === unit.repo && u.branch === unit.base)) {
    const refresh = await refreshBase(unit, `refresh:${tag}`, 'Validate', review ? unit.fromSha : null)
    if (refresh && refresh.refreshed && refresh.reviewBase) reviewFrom = refresh.reviewBase
    else if (refresh && refresh.refreshed && review && unit.fromSha) {
      baseMerged = true
      caveats.push(`${unit.branch}: the review base could not be rebuilt with ${unit.base}'s CI fixes, so the repair-delta review also reads them.`)
    }
    if (!refresh || !refresh.refreshed) {
      summary.ci = refresh ? 'skipped' : 'no-verdict'
      hil.push({
        slug: null,
        kind: refresh ? 'merge-conflict' : 'no-verdict',
        stage: 'base-refresh',
        reason: refresh
          ? `${unit.repo} ${unit.branch}: merging the ${repairMode ? 'repaired' : 'refreshed'} base ${unit.base} needs a judgment call: ${refresh.conflict}; the branch was not validated.`
          : `${unit.repo} ${unit.branch}: the base-refresh agent returned no result after a retry; the branch was not validated.`,
      })
      continue
    }
  }

  await rescoutIfTouched(unit, tag)
  const hasFiles = !repairMode || taskFilesOf(unit).length > 0
  const reviewed = review && (!repairMode || unit.instructions.length > 0)
  // The full gate runs first and is the verdict; it runs again at the end only when a fixer moved
  // HEAD past the commit it graded. Without review nothing after it can withhold the marks.
  let { ci, fault } = await runCi(unit, 'full', hasFiles && !reviewed, `ci:${tag}`)
  const fullCi = ci
  const fullHead = ci && !fault ? (ci.head || '').trim() || null : null
  // After a passing full verdict only the review fixer commits; a sha it did not report counts as moved.
  let head = fullHead
  const ciFixes = []
  let stalled = 0
  while (ci && !fault && !ci.passed && summary.fixRounds < maxFixRounds) {
    summary.fixRounds += 1
    const fix = await tryTwice(fixPrompt(unit, ci.failures, 'CI', ci.preExisting || []), { label: `fix-ci:${tag}#${summary.fixRounds}`, phase: 'Validate', schema: FIX_RESULT })
    if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-ci: ${c}`))
    if (fix && fix.fromSha && fix.toSha && fix.fromSha !== fix.toSha) ciFixes.push(`${fix.fromSha}..${fix.toSha}`)
    // A round that committed nothing left the tree CI just graded: another round re-runs the same
    // pipeline on it and spends the budget on failures no fixer here will touch.
    if (fix && fix.fromSha && fix.fromSha === fix.toSha) {
      caveats.push(`${unit.branch} fix-ci round ${summary.fixRounds} committed nothing; the remaining failures go to a human`)
      stalled = summary.fixRounds
      break
    }
    ;({ ci, fault } = await runCi(unit, 'scoped', false, `ci:${tag}#${summary.fixRounds + 1}`))
  }
  if (!ci || fault) {
    summary.ci = 'no-verdict'
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'ci',
      reason: fault
        ? `${unit.repo} ${unit.branch}: the CI agent ${fault}; its verdict was discarded after ${summary.fixRounds} fix rounds — the branch is unvalidated, not failing.`
        : `${unit.repo} ${unit.branch}: the CI agent returned no result after a retry (transient API failure); the branch has no verdict after ${summary.fixRounds} fix rounds — absence of evidence, not a failure.`,
    })
    continue
  }
  summary.preExisting = (ci.preExisting || []).length
  summary.skipped = ci.skipped || []
  if (!ci.passed) {
    summary.ci = 'failed'
    hil.push({
      slug: null,
      kind: 'ci',
      reason: stalled
        ? `${unit.repo} ${unit.branch}: CI failing; fix round ${stalled} committed nothing, so the last verdict stands: ${ci.failures.join('; ')}`
        : `${unit.repo} ${unit.branch}: CI still failing after ${summary.fixRounds} fix rounds: ${ci.failures.join('; ')}`,
    })
    continue
  }
  summary.ci = 'passed'

  let reviewDead = null // why the review has no verdict for this branch
  let reviewHeld = false // findings wait for a human; only a gated review holds a branch on them
  if (reviewed) {
    const outcome = repairMode ? await reviewRepaired(unit, tag, summary, reviewFrom, ciFixes, baseMerged) : await reviewImplemented(unit, tag, summary)
    reviewDead = outcome.dead
    reviewHeld = outcome.held
    if ('head' in outcome) head = outcome.head
  }

  // A verdict left by a scoped fix-round run, or a HEAD a fixer moved, needs the full list again.
  const markFiles = hasFiles && !reviewDead && !reviewHeld
  // Without a review nothing commits after the first full run, which already marked the files.
  const finalNeeded = ci !== fullCi || (reviewed && (!fullHead || head !== fullHead))
  let finalCi = ci
  if (finalNeeded) {
    let finalFault
    ;({ ci: finalCi, fault: finalFault } = await runCi(unit, 'full', markFiles, `ci:${tag}:final`))
    if (finalCi && !finalFault && !finalCi.passed) {
      // One fix round here: a final-gate failure is often mechanical — a derived artifact the
      // review fixes invalidated — and only what survives the round deserves a human.
      summary.fixRounds += 1
      const fix = await tryTwice(fixPrompt(unit, finalCi.failures, 'final-gate CI', finalCi.preExisting || []), { label: `fix-final:${tag}`, phase: 'Validate', schema: FIX_RESULT })
      if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-final: ${c}`))
      ;({ ci: finalCi, fault: finalFault } = await runCi(unit, 'full', markFiles, `ci:${tag}:final#2`))
    }
    if (!finalCi || finalFault) {
      summary.ci = 'no-verdict'
      hil.push({
        slug: null,
        kind: 'no-verdict',
        stage: 'ci-final',
        reason: finalFault
          ? `${unit.repo} ${unit.branch}: CI passed but the final full-gate agent ${finalFault}; its verdict was discarded and the branch has no final verdict.`
          : `${unit.repo} ${unit.branch}: CI passed but the final full-gate agent returned no result after a retry; the branch has no final verdict.`,
      })
      continue
    }
    summary.preExisting = (finalCi.preExisting || []).length
    summary.skipped = finalCi.skipped || []
    if (!finalCi.passed) {
      summary.ci = 'failed-final'
      hil.push({
        slug: null,
        kind: 'ci',
        reason: `${unit.repo} ${unit.branch}: the full run after the fix ${repairMode ? '' : 'and review '}rounds failed: ${finalCi.failures.join('; ')}`,
      })
      continue
    }
  }

  // An unreviewed branch, or one a gated review holds on findings, is not done.
  if (reviewDead) {
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'review',
      reason: `${unit.repo} ${unit.branch}: CI passed, but ${reviewDead}; ${keptStatus} until a relaunch reviews it.`,
    })
    continue
  }
  if (reviewHeld) continue

  // A final run marks the files itself; a first full verdict marks them only when no review follows
  // it, so when no final run was needed one cheap agent marks them instead.
  const marked = !markFiles || finalCi.marked || (!finalNeeded && (await markDone(unit, tag)))
  if (!marked) {
    // The files are the state store; in-memory state must never outrun them.
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'done-marking',
      reason: `${unit.repo} ${unit.branch}: the full gate passed but the task files were not confirmed marked; ${repairMode ? 'they keep their previous status' : 'they still read merged'} — a relaunch re-validates cheaply and finishes the marking.`,
    })
    continue
  }
  for (const slug of unit.tasks || []) status.set(slug, 'done')
}

// What agents flagged on the way to success — deviations, side effects of literal decisions, skipped
// fixes, resolved conflicts. These must reach the user; they die in transcripts otherwise. The recon
// knowledge is returned so a relaunch or a follow-up repair reuses it instead of re-scouting.
return repairMode
  ? {
      branches: validation,
      hil,
      caveats,
      toolchain: Object.fromEntries(toolchain),
      baseline: Object.fromEntries(baseline),
    }
  : {
      tasks: tasks.map((t) => ({ slug: t.slug, status: status.get(t.slug) })),
      branches: validation,
      hil,
      unreachable,
      caveats,
      toolchain: Object.fromEntries(toolchain),
      baseline: Object.fromEntries(baseline),
    }

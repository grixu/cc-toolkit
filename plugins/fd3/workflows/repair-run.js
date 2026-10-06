export const meta = {
  name: 'repair-run',
  description: 'Apply human HIL decisions to existing task branches, then re-validate each branch and review what the repair changed',
  whenToUse: 'Launched by the fd3:implement-tasks skill after the user has decided the HIL items of an implement-run report; not meant to be invoked bare.',
  phases: [
    { title: 'Recon', detail: 'only for repositories whose toolchain or baseline knowledge did not arrive in args' },
    { title: 'Repair', detail: 'one agent per branch, the HIL decision applied verbatim; a stacked branch after its base' },
    { title: 'Validate', detail: 'scoped CI with fix rounds, a review of the repair delta, then the full gate, one branch at a time' },
  ],
}

// args, provided by the fd3:implement-tasks skill (the script has no filesystem access):
//   repairs      [{ repo, branch, worktree, base, instructions, taskFiles }]
//                repo and worktree are absolute paths; base is the ref the branch's diff is
//                measured against (its stack base, or the repo's diffBase); instructions carry
//                the user's HIL decisions verbatim; taskFiles are the task files to flip to done
//                when the branch passes, may be empty
//   repos        { [repository path]: { startRef, diffBase } } — as implement-run takes them
//   reportPath   (optional) absolute path of the previous run's report file; one cheap agent reads
//                its toolchain and baseline knowledge, sparing a re-scout and a re-baseline
//   toolchain    (optional) { [repository path]: <scout report> } — an alternative to reportPath;
//                repositories missing from both are re-scouted
//   baseline     (optional) { [repository path]: { commands: [...] } } — likewise
//   maxFixRounds CI fix attempts per branch before giving up
//   review       true or "gated" to review each repaired branch's delta with the code-review plugin's
//                headless lenses; its findings go to the human, never to a fixer, and only a gated
//                review keeps the task files from being marked done until the human settles them
//   specPath     (optional) absolute path of the spec, for the review's spec lens

// args can arrive JSON-encoded depending on the caller; normalize before destructuring
const input = typeof args === 'string' ? JSON.parse(args) : args
const { repairs, repos, specPath } = input
const review = input.review === true || input.review === 'gated'
const gated = input.review === 'gated'
// Undefined would make every `fixRounds < maxFixRounds` false and silently skip the fix rounds
// the run exists to perform, reporting failures it was built to repair.
const maxFixRounds = input.maxFixRounds ?? 3

const toolchain = new Map(Object.entries(input.toolchain || {}))
const baseline = new Map(Object.entries(input.baseline || {}))
const hil = [] // decisions an agent could not apply, and everything left without a verdict
const caveats = [] // agent-flagged facts — deviations, skipped fixes — surfaced in the report
const worktreePath = (repo, name) => `${repo}.worktrees/${name.replace(/\//g, '-')}`
// Every label names the unit, never just the repository: one repository carries many branches, and
// without the branch a fix loop and a fan-out look identical in the run view.
const unitTag = (unit) => `${unit.repo.split('/').pop()}:${unit.branch.replace(/\//g, '-')}`
// Where work starts and what it is measured against part ways when the run builds on a branch the
// user parked the checkout on: worktrees start from that branch, and a diff against it is empty.
const refOf = (repo, key) => (repos && repos[repo] && repos[repo][key]) || "the repository's default branch"
const startRef = (repo) => refOf(repo, 'startRef')
const diffBase = (repo) => refOf(repo, 'diffBase')
// The harness relays the user's request to every agent, and a cheap model reads it as its own task
// and re-runs the skill that launched this workflow.
const STEP_GUARD =
  'Do only the step this prompt describes. Invoke no skill or slash command it does not name, ' +
  'whatever the relayed user request says: that request belongs to the session that launched this workflow.\n\n'
// One retry rides out transient API failures (529s, brief limit blips). A second null is a real
// no-verdict — absence of evidence that must never be reported as a validation verdict.
const tryTwice = async (prompt, opts) =>
  (await agent(STEP_GUARD + prompt, opts)) ?? agent(STEP_GUARD + prompt, { ...opts, label: `${opts.label}:retry` })

const repositories = [...new Set(repairs.map((r) => r.repo))]

// ---- Recon: fill whatever knowledge the caller could not hand over

phase('Recon')

const BASELINE_COMMANDS = {
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
}

const BASELINE_RESULT = {
  type: 'object',
  required: ['commands'],
  properties: {
    commands: BASELINE_COMMANDS,
    skipped: { type: 'array', items: { type: 'string' }, description: 'commands not run, each with the reason — a skip is never recorded as passed' },
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
        properties: { repository: { type: 'string' }, commands: BASELINE_COMMANDS },
      },
    },
  },
}

// The previous run's recon knowledge is already in its report file, and one cheap read of it costs
// less than one scout of one repository.
if (input.reportPath && repositories.some((repo) => !toolchain.get(repo))) {
  const handover = await tryTwice(
    [
      `Read the previous run's report at ${input.reportPath} and return the recon knowledge it holds`,
      `for these repositories:`,
      ...repositories.map((repo) => `- ${repo}`),
      ``,
      `Return each repository's toolchain report verbatim — the whole string, unedited — and its`,
      `baseline command list. Omit a repository the report does not carry. Never summarise, reformat`,
      `or reconstruct a toolchain report: the baseline is matched against it by command string, so a`,
      `command list that differs from the one the baseline measured is worse than no baseline.`,
    ].join('\n'),
    { label: 'handover', phase: 'Recon', schema: HANDOVER_RESULT, model: 'haiku', effort: 'low' },
  )
  if (handover) {
    for (const t of handover.toolchain || []) if (!toolchain.get(t.repository)) toolchain.set(t.repository, t.report)
    for (const b of handover.baseline || []) if (!baseline.get(b.repository)) baseline.set(b.repository, { commands: b.commands })
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
    `Establish the validation baseline of the repository ${repo} on its clean base.`,
    ``,
    `1. Create a worktree at ${worktreePath(repo, 'baseline')} from ${startRef(repo)}`,
    `   (git worktree add --detach <path> <ref>) unless it already exists — then reuse it as is.`,
    `   Detached, because the ref may be a branch already checked out elsewhere, which git refuses`,
    `   a second worktree for.`,
    `2. Run every runnable validation command from the toolchain report below, in the reported`,
    `   order, sequentially — never in parallel. Each command's cwd in the report is relative to`,
    `   the repository root: resolve it inside that worktree, never against ${repo}. Skip what the`,
    `   report lists as not runnable here, recording each skip under skipped with its reason — a`,
    `   skip is never recorded as passed.`,
    `3. Fix nothing, change nothing. Run each command once, as \`<command> 2>&1; echo "exit $?"\``,
    `   — that one run gives both the output and the exit status. Record, per command, whether it`,
    `   exited 0, and for each failure the output lines that matter.`,
    ``,
    toolchain.get(repo),
  ].join('\n')

// Sequential on purpose — at most one build/lint/test pipeline on the machine — and unawaited
// until Validate, so it overlaps the repair agents, which run no pipelines.
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
        `This branch's toolchain report was detected on the branch itself, so a command it names that`,
        `the baseline above lacks has no baseline. When such a command fails, run it once in the clean`,
        `base worktree ${worktreePath(unit.repo, 'baseline')}: a failure that occurs there too is pre-existing.`,
      ]

const baselineText = (repo) => {
  const b = baseline.get(repo)
  if (!b) return 'No baseline is available for this repository — treat every failure as introduced by the branch.'
  const lines = b.commands.map((c) =>
    c.passed
      ? `- ${c.command}: passed`
      : `- ${c.command}: FAILED on the clean base:\n` + (c.failures || []).map((f) => `    ${f}`).join('\n'),
  )
  return `Baseline on the clean base (${startRef(repo)}):\n${lines.join('\n')}`
}

// ---- Repair: the decision is the authority; agents apply it, they do not re-design

phase('Repair')

const REPAIR_RESULT = {
  type: 'object',
  required: ['outcome', 'summary'],
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
    ``,
    `Before your first edit, run \`git rev-parse HEAD\` in the worktree and return it as fromSha.`,
    `Work only inside the worktree. Do not run linters, test suites or builds — validation runs`,
    `after you. Make one commit per decision quoted above, each with a conventional-commit message`,
    `describing that decision's change — a reviewer reverts or questions one decision, never a bundle.`,
    `Merge no other branch into this one unless a decision above says to: the workflow brings a`,
    `stacked branch up to its repaired base itself, after that base's repair has landed.`,
    ``,
    `Return outcome "repaired" with a two-sentence summary of what changed, or outcome "blocked"`,
    `with the reason when the decision cannot be applied as stated. Never guess past an ambiguity.`,
    `Under caveats, return every side effect of applying the decision literally that the human`,
    `should see — a degraded type, a narrower behavior than the decision may have intended.`,
  ].join('\n')

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
      `${unit.branch}, so the branch builds on its repaired base. Resolve a conflict only when the`,
      `resolution is mechanical; commit it. When a conflict needs a judgment call, abort`,
      `(git merge --abort) and return refreshed=false with the conflict described. Return`,
      `refreshed=true when the merge landed or the branch already contained ${unit.base}.`,
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
    { label, phase: phaseName, schema: REFRESH_RESULT },
  )

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

const units = []
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

// ---- Validate: one branch at a time, so at most one build/lint/test pipeline runs at once

phase('Validate')

await baselineReady

const CI_RESULT = {
  type: 'object',
  required: ['passed', 'failures', 'branch', 'dirty'],
  properties: {
    passed: { type: 'boolean', description: 'true when nothing fails beyond the baseline' },
    failures: { type: 'array', items: { type: 'string' }, description: 'one entry per newly failing command, with the load-bearing output lines' },
    branch: { type: 'string', description: '`git -C <worktree> branch --show-current`, read before the first command; `detached` when HEAD is detached' },
    dirty: { type: 'string', description: '`git -C <worktree> status --porcelain` after the last command, verbatim; an empty string when the tree is clean' },
    preExisting: { type: 'array', items: { type: 'string' }, description: 'failures that match the baseline of the clean base — informational, never fixed on this branch' },
    marked: { type: 'boolean', description: 'the task files were set to done; asked for on a final gate only' },
  },
}

// A branch checked out in the repository itself has no worktree of its own, and that checkout is
// the user's: their uncommitted work sits in the tree the commands would grade. Validate it in a
// detached worktree at the branch's commit — repairs still land in the checkout.
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
    `Run the validation commands for the repository ${unit.repo}, branch ${unit.branch},`,
    `in the worktree ${tree}. Run them in the reported order, sequentially — never in`,
    `parallel. Run each one as \`<command> > ${tree}.ci.log 2>&1; echo "exit $?"\` — the log sits`,
    `beside the worktree, never inside it — read pass or fail from that exit line alone, and read`,
    `the log only for the lines a failure needs. Never pipe a command into \`tail\`, \`head\` or`,
    `\`grep\`: the pipe's status replaces the command's, and a failing suite then reads as whatever`,
    `its output happens to show.`,
    ``,
    ...treeSetup(unit),
    `\`cd ${tree}\` before anything else, and name the tree in every git command you run —`,
    `\`git -C ${tree} …\` — because the shell's working directory can reset between commands, and`,
    `a git command that silently runs in another checkout describes that checkout instead. Confirm`,
    `what you are about to grade: \`git -C ${tree} rev-parse HEAD\` must equal`,
    `\`git -C ${unit.repo} rev-parse ${unit.branch}\`. When they match,`,
    `return branch "${unit.branch}". When they do not, run nothing: return the branch you actually`,
    `found (or the short HEAD sha when detached) as branch, with passed=false and the mismatch in`,
    `failures. Every command runs from that worktree: each command's cwd in the report is relative`,
    `to the repository root, so resolve it there — never against ${unit.repo}, which is a`,
    `different checkout on a different branch.`,
    ``,
    `Toolchain report for this repository:`,
    ``,
    toolchainFor(unit),
    ``,
    baselineText(unit.repo),
    ...ownToolchainNote(unit),
    ``,
    mode === 'scoped'
      ? `Scope the run to this branch's changes: list them with` +
        `\n\`git diff --name-only ${unit.base || diffBase(unit.repo)}...HEAD\` — that ref is the` +
        `\nbase, never diff the branch against itself — and use each command's scoped form from` +
        `\nthe report on those paths, quoting every path you pass to a shell (unquoted brackets` +
        `\nand globs break zsh); run a command in full only when the report marks it not scopeable.`
      : `Run every command in full — this is the branch's final gate before it is handed over.`,
    ``,
    `Skip everything the report lists as not runnable here, and skip a command the baseline`,
    `shows failing before it produces a verdict — re-proving a baseline failure is wasted time.`,
    `Every skip goes under skipped with its reason; a skip is never reported as passed. A failure`,
    `whose location and message match the baseline is pre-existing: return it under preExisting,`,
    `never under failures, and do not count it against the branch.`,
    ``,
    `Do not fix anything. Editing a source file, applying a formatter, and regenerating a derived`,
    `artifact a command compares against — an index, a schema, a lockfile — are all fixing: report`,
    `the failure and leave it. A verdict is only worth what the tree it ran on was, so when the`,
    `last command has run, run \`git -C ${tree} status --porcelain\` and return its output`,
    `verbatim as dirty.`,
    `Return passed=true only when every runnable command exits 0 or fails only on baseline`,
    `entries; otherwise return each newly failing command with the output lines that matter.`,
    ...(markFiles
      ? [
          ``,
          `One thing beyond the commands. When — and only when — you return passed=true and dirty`,
          `lists nothing but these task files, set \`status: done\` in their frontmatter, changing`,
          `nothing else in them, and return marked=true:`,
          ...unit.taskFiles.map((f) => `- ${f}`),
          `They are the run's state store, and the no-fixing rule above is about the code, not`,
          `about them: edit them at the absolute paths listed, commit nothing, and if they happen`,
          `to sit inside a checkout of this repository, leave that checkout's other files alone.`,
          `On any failure leave them untouched and return marked=false.`,
        ]
      : []),
  ].join('\n')
}

const FIX_RESULT = {
  type: 'object',
  required: ['summary'],
  properties: {
    summary: { type: 'string' },
    caveats: { type: 'array', items: { type: 'string' }, description: 'problems skipped with the reason, judgment calls that went beyond the listed problems, and any change that touches a spec decision' },
  },
}

const fixPrompt = (unit, problems) =>
  [
    `Fix CI problems on branch ${unit.branch} in the worktree ${unit.worktree}`,
    `(repository ${unit.repo}). Problems:`,
    ``,
    ...problems.map((p) => `- ${p}`),
    ``,
    `Fix only what is listed — no refactoring, no drive-by changes, and never touch problems`,
    `that pre-date this branch. A listed problem that cannot be fixed without an action a human`,
    `must take or approve — anything that touches production, anything irreversible, any secret`,
    `or credential, generating a migration, and whatever this repository's own rules reserve —`,
    `is a blocker, not a fix: skip it and record it under caveats. Never guess your way past it.`,
    `A failure the fix can only clear by changing behaviour — an exception carved out of a rule,`,
    `a narrowed decision, an error that stops meaning what it meant — is a design call, not a fix:`,
    `skip it and record under caveats what the choice is.`,
    ``,
    `Toolchain report for this repository — when a fix changes something a listed command`,
    `derives an artifact from, regenerate that artifact the way the report says:`,
    ``,
    toolchainFor(unit),
    ``,
    `Commit the fixes with a conventional-commit message. To verify a fix you may re-run the`,
    `exact commands that failed, scoped to the files they failed on — never a whole suite; the`,
    `full validation runs after you.`,
    ``,
    `Return a two-sentence summary. Under caveats, return every problem you skipped with the`,
    `reason, any judgment call that went beyond the listed problems, and any change that touches`,
    `a decision recorded in the spec.`,
  ].join('\n')

const PREP_RESULT = {
  type: 'object',
  required: ['status', 'invoked'],
  properties: {
    invoked: { type: 'boolean', description: 'the code-review:cr-prepare skill was invoked through the Skill tool' },
    status: { enum: ['ready', 'empty', 'error'] },
    files: { type: 'number', description: 'judged files' },
    active: { type: 'array', items: { type: 'string' }, description: 'active lenses, by name' },
    inactive: { type: 'array', items: { type: 'string' }, description: 'inactive lenses, each with its reason' },
    alternate: { type: 'string', description: 'the alternate base and its file count; only when status is empty and the skill named one' },
    reason: { type: 'string', description: 'only when status is error' },
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

const CR_MERGE_RESULT = {
  type: 'object',
  required: ['status', 'invoked', 'findings'],
  properties: {
    invoked: { type: 'boolean', description: 'the code-review:cr-merge skill was invoked through the Skill tool' },
    status: { enum: ['merged', 'incomplete', 'error'] },
    report: { type: 'string', description: 'absolute path of report.md' },
    missing: { type: 'array', items: { type: 'string' }, description: 'lenses that did not report; only when status is incomplete' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'family', 'rule', 'location', 'risk', 'fix'],
        properties: {
          severity: { type: 'string', description: 'high | medium | nit; `comment` for a comment verdict' },
          family: { type: 'string' },
          rule: { type: 'string', description: 'the rule, or for a comment verdict R<n> and its verdict' },
          location: { type: 'string', description: '<path>:L<lines>' },
          risk: { enum: ['safe', 'structural', 'report-only'] },
          fix: { type: 'string' },
          reserved: { type: 'boolean', description: 'a direct consequence of the open work the prompt lists' },
          boyScout: { type: 'boolean', description: 'the finding line carries the `boy-scout` token: it is about code the change did not touch' },
        },
      },
    },
  },
}

// The lens skills read a context directory, never this prompt, so the run's own facts — which tree,
// which base, what is deliberately unfinished — reach them only through the wrapper agents.
const reviewDir = (unit, pass) => `${unit.repo}.worktrees/.review/${unit.branch.replace(/\//g, '-')}-${pass}`

const prepPrompt = (unit, base, dir) => {
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
    ``,
    `Return what its closing block says: status, judged file count, active and inactive lenses,`,
    `the alternate on empty, the reason on error — and invoked=true. When the Skill tool is not`,
    `available to you, return invoked=false and status "error"; never do the skill's work by hand.`,
  ].join('\n')
}

const scanPrompt = (lens, dir) =>
  [
    `Invoke the \`code-review:cr-scan\` skill through the Skill tool with`,
    `\`--lens ${lens} --context ${dir}\`, and return what its closing block says — status, files`,
    `judged of the total — with invoked=true. When the Skill tool is not available to you, return`,
    `invoked=false, status "error" and zero counts; never judge the change by hand.`,
  ].join('\n')

const crMergePrompt = (dir) =>
  [
    `Invoke the \`code-review:cr-merge\` skill through the Skill tool with \`--context ${dir}\`,`,
    `and return what its closing block says: status, the report path, the lenses that did not`,
    `report on incomplete, and every finding line as one entry — severity, family, rule, location,`,
    `risk class and the fix. A comment verdict's severity is \`comment\`; a line carrying the`,
    `\`boy-scout\` token sets boyScout=true. Return invoked=true; when`,
    `the Skill tool is not available to you, return invoked=false, status "error" and no findings.`,
  ].join('\n')

// A review that did not run is absence of evidence: an empty change, a lens that judged nothing or a
// skill the agent never invoked all come back as a reason, never as an empty findings list.
const runReview = async (unit, base, pass, tag) => {
  const dir = reviewDir(unit, pass)
  const prep = await tryTwice(prepPrompt(unit, base, dir), { label: `cr-prep:${tag}:${pass}`, phase: 'Validate', schema: PREP_RESULT })
  if (!prep || !prep.invoked || prep.status === 'error') {
    return { dir, dead: `cr-prepare ${prep ? `failed: ${prep.reason || 'the skill was not invoked'}` : 'returned no result after a retry'}` }
  }
  if (prep.status === 'empty') {
    return { dir, empty: true, dead: `the change against ${base} is empty${prep.alternate ? ` (the skill names ${prep.alternate})` : ''}` }
  }
  const lenses = prep.active || []
  const scans = await parallel(
    lenses.map((lens) => () =>
      tryTwice(scanPrompt(lens, dir), { label: `cr:${tag}:${pass}:${lens}`, phase: 'Validate', schema: SCAN_RESULT }),
    ),
  )
  const deadLenses = lenses.filter((_, i) => {
    const r = scans[i]
    return !r || !r.invoked || r.status === 'error' || (r.status === 'scanned' && r.filesTotal > 0 && r.filesJudged === 0)
  })
  if (deadLenses.length > 0) return { dir, dead: `lens ${deadLenses.join(', ')} did not report` }
  const merged = await tryTwice(crMergePrompt(dir), { label: `cr-merge:${tag}:${pass}`, phase: 'Validate', schema: CR_MERGE_RESULT })
  if (!merged || !merged.invoked || merged.status !== 'merged') {
    const why = !merged
      ? 'returned no result after a retry'
      : merged.status === 'incomplete'
        ? `found lens ${(merged.missing || []).join(', ')} missing`
        : 'failed'
    return { dir, dead: `cr-merge ${why}` }
  }
  return { dir, report: merged.report, files: prep.files || 0, lenses: lenses.length, findings: merged.findings }
}

const serious = (f) => f.severity === 'high' || f.severity === 'medium'
const findingLine = (f) => `${f.location} — ${f.family} · ${f.rule} (${f.severity}): ${f.fix}`

const mechanical = { model: 'haiku', effort: 'high' } // CI runners interpret command output; they design nothing

// A CI verdict is a statement about one tree at one commit. A runner that stayed in the
// repository's main checkout graded another branch's code, and one that edited its way to green
// graded a state no commit holds — both are absence of evidence, never a pass.
const porcelainPath = (line) => {
  const p = line.length > 3 ? line.slice(3) : ''
  const renamed = p.indexOf(' -> ')
  return (renamed === -1 ? p : p.slice(renamed + 4)).replace(/^"|"$/g, '')
}
const ciFault = (ci, unit) => {
  const ran = (ci.branch || '').trim()
  if (ran && ran !== unit.branch) return `ran in a checkout on ${ran} instead of ${unit.branch}`
  if (!ran) return `could not name the branch it ran on`
  // The final gate flips this branch's task files to done itself, so their own dirtiness is
  // expected wherever the tasks directory happens to live; anything else is the runner's edit.
  const own = new Set(unit.taskFiles || [])
  const tree = validationTree(unit)
  const stray = (ci.dirty || '')
    .split('\n')
    .filter((line) => line.trim())
    .map(porcelainPath)
    .filter((p) => p && !own.has(`${tree}/${p}`))
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

const runCi = async (unit, mode, markFiles, label) => {
  const ci = await tryTwice(ciPrompt(unit, mode, markFiles), { label, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  if (!ci) return { ci: null, fault: null }
  const fault = ciFault(ci, unit)
  if (fault && ci.marked) await unmark(unit.taskFiles || [], label)
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
// typecheck and test steps they added. A repaired branch is measured from the default branch, so a
// stack whose root brought those checks in is re-scouted on the tree under repair.
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
      `List what the branch ${unit.branch} changed: \`git -C ${tree} diff --name-only ${diffBase(unit.repo)}...HEAD\`.`,
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

const validation = [] // per-branch summary for the final report

for (const unit of units) {
  const tag = unitTag(unit)
  const summary = { repo: unit.repo, branch: unit.branch, ci: 'pending', fixRounds: 0, preExisting: 0 }
  validation.push(summary)

  if (!toolchain.get(unit.repo)) {
    summary.ci = 'no-verdict' // the scout's death is already on the HIL list, once per repository
    continue
  }

  // The base's own CI fixes land after this branch's repair; validating without them grades a stack
  // that will never exist.
  let reviewFrom = unit.fromSha
  if (units.some((u) => u !== unit && u.repo === unit.repo && u.branch === unit.base)) {
    const refresh = await refreshBase(unit, `refresh:${tag}`, 'Validate', review ? unit.fromSha : null)
    if (refresh && refresh.refreshed && refresh.reviewBase) reviewFrom = refresh.reviewBase
    else if (refresh && refresh.refreshed && review && unit.fromSha) {
      caveats.push(`${unit.branch}: the review base could not be rebuilt with ${unit.base}'s CI fixes, so the repair-delta review also reads them.`)
    }
    if (!refresh || !refresh.refreshed) {
      summary.ci = refresh ? 'skipped' : 'no-verdict'
      hil.push({
        slug: null,
        kind: refresh ? 'merge-conflict' : 'no-verdict',
        stage: 'base-refresh',
        reason: refresh
          ? `${unit.repo} ${unit.branch}: merging the repaired base ${unit.base} needs a judgment call: ${refresh.conflict}; the branch was not validated.`
          : `${unit.repo} ${unit.branch}: the base-refresh agent returned no result after a retry; the branch was not validated.`,
      })
      continue
    }
  }

  await rescoutIfTouched(unit, tag)
  let { ci, fault } = await runCi(unit, 'scoped', false, `ci:${tag}`)
  while (ci && !fault && !ci.passed && summary.fixRounds < maxFixRounds) {
    summary.fixRounds += 1
    const fix = await tryTwice(fixPrompt(unit, ci.failures), { label: `fix-ci:${tag}#${summary.fixRounds}`, phase: 'Validate', schema: FIX_RESULT })
    if (fix && fix.caveats) caveats.push(...fix.caveats.map((c) => `${unit.branch} fix-ci: ${c}`))
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
  if (!ci.passed) {
    summary.ci = 'failed'
    hil.push({
      slug: null,
      kind: 'ci',
      reason: `${unit.repo} ${unit.branch}: CI still failing after ${summary.fixRounds} fix rounds: ${ci.failures.join('; ')}`,
    })
    continue
  }

  // A repair is new code written to a human's one-line decision; CI proves it builds, never that it
  // did only what was decided — the review reads the repair's own commits, and a human reads that.
  let reviewDead = null
  let reviewHeld = false
  if (review) {
    if (!unit.fromSha) {
      reviewDead = 'the repair agent did not report its starting commit, so the repair delta is unknown'
    } else {
      const delta = await runReview(unit, reviewFrom, 'repair', tag)
      summary.review = { context: delta.dir, report: delta.report || null }
      if (delta.dead && !delta.empty) {
        reviewDead = `the review of the repair did not run: ${delta.dead}`
      } else if (!delta.empty) {
        const open = delta.findings.filter(serious)
        summary.review.findings = delta.findings.map(findingLine)
        for (const f of open) {
          hil.push({
            slug: null,
            kind: 'review',
            reason: `${unit.repo} ${unit.branch}: ${findingLine(f)} — ${gated ? 'the task files keep their status until a repair settles it' : 'left for the end-of-run decision; the branch is not held on it'}`,
          })
        }
        reviewHeld = gated && open.length > 0
      }
    }
  }

  // The full command list is the branch's final gate — repairs go out only fully validated.
  const markFiles = !!(unit.taskFiles && unit.taskFiles.length > 0) && !reviewDead && !reviewHeld
  const { ci: finalCi, fault: finalFault } = await runCi(unit, 'full', markFiles, `ci:${tag}:final`)
  if (!finalCi || finalFault) {
    summary.ci = 'no-verdict'
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'ci-final',
      reason: finalFault
        ? `${unit.repo} ${unit.branch}: scoped CI passed but the full-gate agent ${finalFault}; its verdict was discarded and the branch has no final verdict.`
        : `${unit.repo} ${unit.branch}: scoped CI passed but the full-gate agent returned no result after a retry; the branch has no final verdict.`,
    })
    continue
  }
  summary.preExisting = (finalCi.preExisting || []).length
  if (!finalCi.passed) {
    summary.ci = 'failed-final'
    hil.push({
      slug: null,
      kind: 'ci',
      reason: `${unit.repo} ${unit.branch}: the full run after the fix rounds failed: ${finalCi.failures.join('; ')}`,
    })
    continue
  }
  summary.ci = 'passed'

  // The final gate marks the files itself: it is already in this unit holding the verdict, where
  // a separate agent per branch spent its whole budget booting to edit one frontmatter line.
  if (reviewDead) {
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'review',
      reason: `${unit.repo} ${unit.branch}: CI passed, but ${reviewDead}; the task files keep their status until a relaunch reviews it.`,
    })
    continue
  }
  if (markFiles && !finalCi.marked) {
    // The files are the state store; in-memory state must never outrun them.
    hil.push({
      slug: null,
      kind: 'no-verdict',
      stage: 'done-marking',
      reason: `${unit.repo} ${unit.branch}: the full gate passed but did not confirm marking the task files; they keep their previous status — a relaunch re-validates cheaply and finishes the marking.`,
    })
  }
}

return {
  branches: validation,
  hil,
  // What agents flagged on the way to success — side effects of literal decisions, skipped
  // fixes. These must reach the user; they die in transcripts otherwise.
  caveats,
  toolchain: Object.fromEntries(toolchain),
  baseline: Object.fromEntries(baseline),
}

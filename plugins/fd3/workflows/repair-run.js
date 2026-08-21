export const meta = {
  name: 'repair-run',
  description: 'Apply human HIL decisions to existing task branches, then re-validate each branch — no code review',
  whenToUse: 'Launched by the fd3:implement-tasks skill after the user has decided the HIL items of an implement-run report; not meant to be invoked bare.',
  phases: [
    { title: 'Recon', detail: 'only for repositories whose toolchain or baseline knowledge did not arrive in args' },
    { title: 'Repair', detail: 'one agent per branch, the HIL decision applied verbatim' },
    { title: 'Validate', detail: 'scoped CI with fix rounds, then the full gate, one branch at a time' },
  ],
}

// args, provided by the fd3:implement-tasks skill (the script has no filesystem access):
//   repairs      [{ repo, branch, worktree, base, instructions, taskFiles }]
//                repo and worktree are absolute paths; base is the ref the branch's diff is
//                measured against (its stack base, or the repo's defaultRef); instructions carry
//                the user's HIL decisions verbatim; taskFiles are the task files to flip to done
//                when the branch passes, may be empty
//   repos        { [repository path]: { defaultRef } }
//   toolchain    { [repository path]: <scout report> } — from the implement-run result;
//                repositories missing here are re-scouted
//   baseline     { [repository path]: { commands: [...] } } — from the implement-run result;
//                repositories missing here are re-baselined
//   maxFixRounds CI fix attempts per branch before giving up

// args can arrive JSON-encoded depending on the caller; normalize before destructuring
const input = typeof args === 'string' ? JSON.parse(args) : args
const { repairs, repos, maxFixRounds } = input

const toolchain = new Map(Object.entries(input.toolchain || {}))
const baseline = new Map(Object.entries(input.baseline || {}))
const hil = [] // decisions an agent could not apply, and everything left without a verdict
const caveats = [] // agent-flagged facts — deviations, skipped fixes — surfaced in the report
const worktreePath = (repo, name) => `${repo}.worktrees/${name.replace(/\//g, '-')}`
const repoDefault = (repo) => (repos && repos[repo] && repos[repo].defaultRef) || "the repository's default branch"
// One retry rides out transient API failures (529s, brief limit blips). A second null is a real
// no-verdict — absence of evidence that must never be reported as a validation verdict.
const tryTwice = async (prompt, opts) =>
  (await agent(prompt, opts)) ?? agent(prompt, { ...opts, label: `${opts.label}:retry` })

const repositories = [...new Set(repairs.map((r) => r.repo))]

// ---- Recon: fill whatever knowledge the caller could not hand over

phase('Recon')

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
  },
}

const baselinePrompt = (repo) =>
  [
    `Establish the validation baseline of the repository ${repo} on its clean base.`,
    ``,
    `1. Create a worktree at ${worktreePath(repo, 'baseline')} from ${repoDefault(repo)}`,
    `   (git worktree add <path> <ref>) unless it already exists — then reuse it as is.`,
    `2. Run every runnable validation command from the toolchain report below, in the reported`,
    `   order, sequentially — never in parallel. Skip what the report lists as not runnable here.`,
    `3. Fix nothing, change nothing. Record, per command, whether it exited 0, and for each`,
    `   failure the output lines that matter.`,
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

// ---- Repair: the decision is the authority; agents apply it, they do not re-design

phase('Repair')

const REPAIR_RESULT = {
  type: 'object',
  required: ['outcome', 'summary'],
  properties: {
    outcome: { enum: ['repaired', 'blocked'] },
    summary: { type: 'string' },
    reason: { type: 'string', description: 'why the decision could not be applied; only when outcome is blocked' },
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
    `Work only inside the worktree. Do not run linters, test suites or builds — validation runs`,
    `after you. Commit with a conventional-commit message describing the repair.`,
    ``,
    `Return outcome "repaired" with a two-sentence summary of what changed, or outcome "blocked"`,
    `with the reason when the decision cannot be applied as stated. Never guess past an ambiguity.`,
    `Under caveats, return every side effect of applying the decision literally that the human`,
    `should see — a degraded type, a narrower behavior than the decision may have intended.`,
  ].join('\n')

// Repair agents edit code and run no pipelines, so they can run in parallel across branches.
const repairResults = await parallel(
  repairs.map((r) => () =>
    tryTwice(repairPrompt(r), {
      label: `repair:${r.branch.replace(/\//g, '-')}`,
      phase: 'Repair',
      schema: REPAIR_RESULT,
    }),
  ),
)

const units = []
repairs.forEach((r, i) => {
  const result = repairResults[i]
  if (result && result.caveats) caveats.push(...result.caveats.map((c) => `${r.branch} repair: ${c}`))
  if (result && result.outcome === 'repaired') {
    units.push(r)
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
  required: ['passed', 'failures'],
  properties: {
    passed: { type: 'boolean', description: 'true when nothing fails beyond the baseline' },
    failures: { type: 'array', items: { type: 'string' }, description: 'one entry per newly failing command, with the load-bearing output lines' },
    preExisting: { type: 'array', items: { type: 'string' }, description: 'failures that match the baseline of the clean base — informational, never fixed on this branch' },
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
        `\n\`git diff --name-only ${unit.base || repoDefault(unit.repo)}...HEAD\` and use each command's scoped form from the` +
        `\nreport on those paths; run a command in full only when the report marks it not scopeable.`
      : `Run every command in full — this is the branch's final gate before it is handed over.`,
    ``,
    `Skip everything the report lists as not runnable here. Do not fix anything.`,
    `A failure whose location and message match the baseline is pre-existing: return it under`,
    `preExisting, never under failures, and do not count it against the branch. Return`,
    `passed=true only when every runnable command exits 0 or fails only on baseline entries;`,
    `otherwise return each newly failing command with the output lines that matter.`,
  ].join('\n')

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
    `that pre-date this branch. A listed problem that cannot be fixed without an action the`,
    `repository reserves for humans — generating a migration, a production mutation, secrets —`,
    `is a blocker, not a fix: skip it and record it under caveats. Never guess your way past it.`,
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
  ].join('\n')

const mechanical = { model: 'haiku', effort: 'high' } // CI runners interpret command output; they design nothing

const validation = [] // per-branch summary for the final report

for (const unit of units) {
  const repoName = unit.repo.split('/').pop()
  const summary = { repo: unit.repo, branch: unit.branch, ci: 'pending', fixRounds: 0, preExisting: 0 }
  validation.push(summary)

  if (!toolchain.get(unit.repo)) {
    summary.ci = 'no-verdict' // the scout's death is already on the HIL list, once per repository
    continue
  }

  let ci = await tryTwice(ciPrompt(unit, 'scoped'), { label: `ci:${repoName}`, phase: 'Validate', schema: CI_RESULT, ...mechanical })
  while (ci && !ci.passed && summary.fixRounds < maxFixRounds) {
    summary.fixRounds += 1
    const fix = await tryTwice(fixPrompt(unit, ci.failures), { label: `fix-ci:${repoName}#${summary.fixRounds}`, phase: 'Validate', schema: FIX_RESULT })
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

  // The full command list is the branch's final gate — repairs go out only fully validated.
  const finalCi = await tryTwice(ciPrompt(unit, 'full'), { label: `ci:${repoName}:final`, phase: 'Validate', schema: CI_RESULT, ...mechanical })
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
      reason: `${unit.repo} ${unit.branch}: the full run after the fix rounds failed: ${finalCi.failures.join('; ')}`,
    })
    continue
  }
  summary.ci = 'passed'

  if (unit.taskFiles && unit.taskFiles.length > 0) {
    const markedDone = await tryTwice(
      `Set \`status: done\` in the frontmatter of these task files, changing nothing else:\n` +
        unit.taskFiles.map((f) => `- ${f}`).join('\n'),
      { label: `done:${repoName}`, phase: 'Validate', model: 'haiku', effort: 'low' },
    )
    if (markedDone == null) {
      // The files are the state store; in-memory state must never outrun them.
      hil.push({
        slug: null,
        kind: 'no-verdict',
        stage: 'done-marking',
        reason: `${unit.repo} ${unit.branch}: validation passed but the done-marking agent returned no result; the task files keep their previous status — a relaunch re-validates cheaply and finishes the marking.`,
      })
    }
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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow, seq } from './harness.mjs'
import { REPO, SPEC, TOOLCHAIN, task, implementArgs, implementDefaults, repair, repairArgs, repairDefaults, finding, ciPass, ciFail, crMerged } from './fixtures.mjs'

const STEP_GUARD = 'Do only the step this prompt describes. Invoke no skill or slash command unless this prompt names it'
const WAIT = ['A command is finished only when its exit line exists.', 'until [ -s <log>.exit ]; do sleep 15; done', 'An unfinished command is never a failure and never a pass.']

// Prompt invariants are checked over every call a broad run makes: two stacked branches, an
// operational task, a handover, a CI fix round, a review with a fix and an unmark — so each agent
// kind of each script is exercised at least once.
const implementRun = () =>
  runWorkflow(
    'implement-run.js',
    implementArgs({
      reportPath: '/r/report.md',
      tasks: [task('ops', { repository: 'none' }), task('t1', { branch: 'feat/a' }), task('t2', { branch: 'feat/b', baseBranch: 'feat/a', dependsOn: ['t1'] })],
    }),
    [
      ['handover', { toolchain: [], baseline: [] }],
      ['cr-merge:app:feat-a:review', crMerged([finding()])],
      ['ci:app:feat-a#2', ciPass],
      ['ci:app:feat-a:final', ciPass],
      ['ci:app:feat-a', ciFail(['boom'])],
      ['ci:app:feat-b:final', seq((p) => ({ ...ciPass(p), passed: false, incomplete: ['pnpm test'], marked: true }), ciPass)],
      ...implementDefaults(),
    ],
  )

const repairRun = () =>
  runWorkflow(
    'repair-run.js',
    repairArgs({ reportPath: '/r/report.md', toolchain: undefined, baseline: undefined, repairs: [repair('feat/a'), repair('feat/b', { base: 'feat/a' })] }),
    [
      ['handover', { toolchain: [], baseline: [] }],
      ['ci:app:feat-a#2', ciPass],
      ['ci:app:feat-a:final', ciPass],
      ['ci:app:feat-a', ciFail(['boom'])],
      ['ci:app:feat-b:final', seq((p) => ({ ...ciPass(p), passed: false, incomplete: ['pnpm test'], marked: true }), ciPass)],
      ...repairDefaults(),
    ],
  )

const kind = (label) => label.split(/[:#]/)[0].replace(/\d+$/, '')

// Data the agent reads comes first, each block fenced in its own tag, and the instructions after it
// never reopen or close a data block.
const leadingTags = (prompt) => {
  let rest = prompt.slice(prompt.indexOf('\n\n') + 2)
  const tags = []
  for (let m; (m = /^<([a-z_]+)>\n/.exec(rest)); ) {
    const close = rest.indexOf(`</${m[1]}>`)
    assert.ok(close > 0, `<${m[1]}> is never closed`)
    tags.push(m[1])
    rest = rest.slice(close + m[1].length + 3).replace(/^\n+/, '')
  }
  return { tags, rest }
}

const EXPECTED_TAGS = {
  baseline: ['toolchain_report'],
  merge: ['toolchain_report'],
  ci: ['toolchain_report', 'baseline'],
  'fix-ci': ['toolchain_report'],
  'fix-cr': ['toolchain_report'],
  'fix-final': ['toolchain_report'],
}

for (const [name, runIt] of [['implement-run', implementRun], ['repair-run', repairRun]]) {
  test(`${name}: the broad run covers every agent kind it is checked for`, async () => {
    const r = await runIt()
    const kinds = new Set(r.labels.map(kind))
    const expected =
      name === 'implement-run'
        ? ['handover', 'scout', 'baseline', 'mark-blocked', 'wave', 'merge', 'toolchain-touch', 'refresh', 'ci', 'fix-ci', 'cr-prep', 'cr', 'cr-merge', 'fix-cr', 'unmark']
        : ['handover', 'scout', 'baseline', 'repair', 'refresh', 'toolchain-touch', 'ci', 'fix-ci', 'cr-prep', 'cr', 'cr-merge', 'unmark']
    for (const k of expected) assert.ok(kinds.has(k), `no ${k} call in ${[...kinds].join(', ')}`)
  })

  test(`${name}: every prompt opens with the step guard`, async () => {
    const r = await runIt()
    for (const c of r.calls) assert.ok(c.prompt.startsWith(STEP_GUARD), `${c.label} lacks the step guard`)
  })

  test(`${name}: data sits in tags before the instructions`, async () => {
    const r = await runIt()
    for (const c of r.calls) {
      const want = EXPECTED_TAGS[kind(c.label)]
      const { tags, rest } = leadingTags(c.prompt)
      if (want) {
        assert.deepEqual(tags, want, `${c.label} data blocks`)
        assert.doesNotMatch(rest, /^<\/?(toolchain_report|baseline)>$/m, `${c.label} reopens a data block after its instructions start`)
      } else {
        assert.deepEqual(tags, [], `${c.label} unexpectedly leads with data tags`)
      }
    }
  })

  test(`${name}: CI, baseline and fix runners carry the wait rule`, async () => {
    const r = await runIt()
    for (const c of r.calls.filter((x) => ['ci', 'baseline', 'fix-ci', 'fix-cr', 'fix-final'].includes(kind(x.label)))) {
      for (const w of WAIT) assert.ok(c.prompt.includes(w), `${c.label} lacks "${w}"`)
    }
  })

  test(`${name}: CI prompts forbid piping, fixing, and confirm the graded commit`, async () => {
    const r = await runIt()
    for (const c of r.callsMatching(/^ci:/)) {
      assert.match(c.prompt, /Never pipe a command into `tail`, `head` or\n`grep`/)
      assert.match(c.prompt, /Do not fix anything\./)
      assert.match(c.prompt, /rev-parse HEAD` must equal/)
      assert.match(c.prompt, /return its output\nverbatim as dirty/)
    }
  })

  test(`${name}: no prompt tells an agent to edit the spec`, async () => {
    const r = await runIt()
    for (const c of r.calls) {
      for (const m of c.prompt.matchAll(/\b(edit|update|modify|amend|rewrite|copy)\b[^.\n]{0,60}\b(spec|specification)\b/gi)) {
        const before = c.prompt.slice(Math.max(0, m.index - 12), m.index)
        assert.match(before, /Never $|not $/, `${c.label}: "${m[0]}" reads as an instruction to change the spec`)
      }
    }
  })

  test(`${name}: model and effort choices per agent kind`, async () => {
    const r = await runIt()
    const cheap = { handover: 'low', 'mark-blocked': 'low', unmark: 'low', 'toolchain-touch': 'low', baseline: 'high', ci: 'high' }
    for (const c of r.calls) {
      const k = kind(c.label)
      if (k in cheap) assert.deepEqual([c.model, c.effort], ['haiku', cheap[k]], c.label)
      else assert.equal(c.model, null, `${c.label} overrides the model`)
    }
    for (const c of r.callsMatching('scout:')) {
      assert.equal(c.agentType, 'fd3:toolchain-scout')
      assert.equal(c.schema, null)
    }
  })
}

test('implement prompt: Consent rule present, the spec is read by pointer and changes only through build-spec', async () => {
  const r = await implementRun()
  const p = r.call('wave1:t1').prompt
  assert.match(p, /A line starting `Consent:` in the task's `## Note` is the user's own decision/)
  assert.match(p, /grants exactly what it names/)
  assert.match(p, /Anything beyond what it names still stops you\./)
  assert.ok(p.includes(`The specification is at ${SPEC}; read only the spec sections`))
  assert.ok(p.includes(`Never edit, copy or commit the specification at ${SPEC}, and never add a copy of it to the\nbranch: the spec changes only through \`/fd3:build-spec ${SPEC}\`.`))
  assert.match(p, /Never read the\n {3}whole spec\./)
  assert.equal(r.call('wave1:t1').schema, 'IMPLEMENT_RESULT')
})

test('fix prompts route a spec change to build-spec and stage by name', async () => {
  for (const r of [await implementRun(), await repairRun()]) {
    for (const c of r.callsMatching('fix-')) {
      assert.ok(c.prompt.includes(`\`/fd3:build-spec ${SPEC}\``), c.label)
      assert.match(c.prompt, /never `git add -A`/)
      assert.match(c.prompt, /Make every edit with the Edit tool/)
      assert.match(c.prompt, /return it as fromSha/)
    }
  }
})

test('code-review wrappers invoke the skill and never do its work by hand', async () => {
  for (const r of [await implementRun(), await repairRun()]) {
    for (const c of r.callsMatching('cr-prep:')) assert.match(c.prompt, /invoke the `code-review:cr-prepare` skill through the Skill tool[\s\S]*never do the skill's work by hand/)
    for (const c of r.callsMatching('cr:')) {
      const lens = c.label.split(':').pop()
      assert.ok(c.prompt.includes(`\`--lens ${lens} --context ${REPO}.worktrees/.review/`), c.label)
      assert.match(c.prompt, /never judge the change by hand/)
    }
    for (const c of r.callsMatching('cr-merge:')) assert.match(c.prompt, /Invoke the `code-review:cr-merge` skill through the Skill tool/)
  }
})

test('repair prompt: the decision is the authority, one commit per decision', async () => {
  const r = await repairRun()
  const p = r.call('repair:app:feat-a').prompt
  assert.match(p, /A human reviewed this branch and decided:\n- rename foo to bar on feat\/a\n/)
  assert.match(p, /Do not read the spec/)
  assert.match(p, /Make one commit per decision quoted above/)
  assert.match(p, /Merge no other branch into this one/)
})

test('toolchain fixture reaches the scoped CI prompt verbatim', async () => {
  const r = await implementRun()
  assert.ok(r.call('ci:app:feat-a').prompt.includes(`<toolchain_report>\n${TOOLCHAIN}\n</toolchain_report>`))
})

test('every fixer is told to read the Consent lines of its own branch task files', async () => {
  const consent = /read every line starting `Consent:` in the `## Note` of this branch's task files:\n((?:- \S+\n)+)/
  const impl = await implementRun()
  for (const label of ['fix-ci:app:feat-a#1', 'fix-cr:app:feat-a']) {
    const m = consent.exec(impl.call(label).prompt)
    assert.ok(m, label)
    assert.equal(m[1], '- /r/app/tasks/t1.md\n', label)
    assert.match(impl.call(label).prompt, /Never undo what one grants/)
  }
  const final = await runWorkflow('implement-run.js', implementArgs({ review: false }), [['ci:app:feat-x:final#2', ciPass], ['ci:app:feat-x:final', ciFail(['stale index'])], ...implementDefaults()])
  assert.equal(consent.exec(final.call('fix-final:app:feat-x').prompt)[1], '- /r/app/tasks/t1.md\n- /r/app/tasks/t2.md\n')

  const rep = await repairRun()
  assert.equal(consent.exec(rep.call('fix-ci:app:feat-a#1').prompt)[1], '- /r/app/tasks/feat-a.md\n')
  const noFiles = await runWorkflow('repair-run.js', repairArgs({ review: false, repairs: [repair('feat/x', { taskFiles: [] })] }), [['ci:app:feat-x:final', ciPass], ['ci:app:feat-x', seq(ciFail(['boom']), ciPass)], ...repairDefaults()])
  assert.doesNotMatch(noFiles.call('fix-ci:app:feat-x#1').prompt, /Consent:/)
})

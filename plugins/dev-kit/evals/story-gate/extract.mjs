#!/usr/bin/env node
// Builds the story gate's model states for every PR in local/cohort.jsonl, with the git commands the tool runs.
//
//   node plugins/dev-kit/evals/story-gate/extract.mjs [--set holdout] [--only owner/repo#123] [--intent] [--function-context]
//
// --intent adds the PR title, its body without generated sections and its commits, standing in for what pr-open
// has drafted by the time the gate runs. --function-context widens each hunk to its whole function.
// Needs gh with access to every repository in the cohort. Output: local/states[.intent][.fn].jsonl.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { clipBulk, isExcluded } from '../../hooks/risk.ts'
import { MAX_STORY_PARTS, planStory, storyDiffBudget, storyIntent } from '../../hooks/story.ts'

const HERE = import.meta.dirname
const LOCAL = path.join(HERE, 'local')
const { values: args } = parseArgs({
  options: { only: { type: 'string' }, set: { type: 'string' }, intent: { type: 'boolean', default: false }, 'function-context': { type: 'boolean', default: false } },
})

const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts })
const git = (dir, argv) => run('git', ['--git-dir', dir, ...argv])

function clone(repo) {
  const dir = path.join(LOCAL, 'clones', repo.replace('/', '__') + '.git')
  if (!fs.existsSync(dir)) run('gh', ['repo', 'clone', repo, dir, '--', '--bare', '--filter=blob:none', '--quiet'])
  return dir
}

const SET = args.set ? path.join(LOCAL, args.set) : LOCAL
const cohort = fs.readFileSync(path.join(SET, 'cohort.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const out = []
for (const c of cohort) {
  if (args.only && args.only !== c.id) continue
  const [repo, number] = c.id.split('#')
  const pr = JSON.parse(run('gh', ['pr', 'view', number, '-R', repo, '--json', 'baseRefOid,headRefOid,title,body,commits']))
  const commits = pr.commits.map((k) => [k.messageHeadline, k.messageBody].filter(Boolean).join('\n\n')).join('\n\n---\n\n')
  const intent = args.intent ? storyIntent(pr.title, pr.body ?? '', commits) : undefined
  const dir = clone(repo)
  git(dir, ['fetch', '--quiet', 'origin', `+refs/pull/${number}/head:refs/pr/${number}`, pr.baseRefOid])
  const range = `${pr.baseRefOid}...refs/pr/${number}`

  const entries = git(dir, ['diff', '--no-relative', '--numstat', '-z', '--no-renames', range]).split('\0').filter(Boolean).map((line) => {
    const [added, , ...p] = line.split('\t')
    return { path: p.join('\t'), binary: added === '-' }
  })
  const reviewable = entries.filter((f) => !f.binary && !isExcluded(f.path)).map((f) => f.path)
  const diffstat = git(dir, ['diff', '--no-relative', '--stat=200', '--no-color', range])

  // Mirrors the tool's reader: past the budget of every allowed request, the change is too large to judge.
  const budget = storyDiffBudget(intent)
  const context = args['function-context'] ? '--function-context' : '-U1'
  const files = []
  let chars = 0
  let tooLarge = false
  for (const p of reviewable) {
    if (chars > budget * MAX_STORY_PARTS) {
      tooLarge = true
      break
    }
    const diff = git(dir, ['diff', '--no-relative', context, '--no-color', '--no-ext-diff', '--no-renames', range, '--', `:(top,literal)${p}`])
    const bulk = clipBulk(p, diff.trimEnd(), budget)
    chars += bulk.text.length
    files.push({ path: p, text: bulk.text })
  }
  const plan = tooLarge ? { tooLarge: true } : planStory(files, diffstat, intent)
  out.push({ id: c.id, base: pr.baseRefOid, head: pr.headRefOid, files: entries.length, ...plan })
  console.error(`${c.id}: ${plan.tooLarge ? 'too large' : `${plan.states.length} part(s)`}`)
}

const variant = (args.intent ? '.intent' : '') + (args['function-context'] ? '.fn' : '')
const file = path.join(SET, args.only ? `states.${args.only.replace(/[/#]/g, '_')}${variant}.jsonl` : `states${variant}.jsonl`)
fs.writeFileSync(file, out.map((o) => JSON.stringify(o)).join('\n') + '\n')
console.log(`${out.length} PRs → ${path.relative(process.cwd(), file)}`)

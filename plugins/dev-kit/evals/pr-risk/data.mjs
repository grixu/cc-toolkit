#!/usr/bin/env node
// Moves the private pr_risk eval data between the git-ignored local/ folder and a Cloudflare R2 bucket.
//
//   node plugins/dev-kit/evals/pr-risk/data.mjs pull v8     # → evals/pr-risk/local/data/v8/, hashes verified
//   node plugins/dev-kit/evals/pr-risk/data.mjs push v8     # the owner's machine only: stages and uploads a set
//   node plugins/dev-kit/evals/pr-risk/data.mjs list
//
// Needs the aws CLI and R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. A set is a flat folder
// with manifest.json, the sha256 of every file; pull refuses a file whose hash differs.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOCAL = join(HERE, 'local')
const PREFIX = 'pr-risk'
const V8 = 'panel-v2/v8/'

// Published name → source under local/. A `tar` entry packs a folder; its excludes keep regenerable bulk out.
const SETS = {
  v8: {
    files: {
      'bindings.json': V8 + 'frozen/bindings.json',
      'factor-states.json': V8 + 'frozen/factor-states.json',
      'inputs-r1.json': V8 + 'frozen/inputs-r1.json',
      'inputs-r2.json': V8 + 'frozen/inputs-r2.json',
      'control.json': V8 + 'frozen/control.json',
      'plan-factors.json': V8 + 'requests/plan-factors.json',
      'result-factors.json': V8 + 'requests/result-factors.json',
      'prs.json': V8 + 'jev/runs/v8-1/prs.json',
      'labels.jsonl': V8 + 'labels.jsonl',
      'labels-seal.json': V8 + 'labels-seal.json',
      'roster.json': V8 + 'roster.json',
      'baseline.json': V8 + 'arms-report.json',
    },
  },
  v5: { tar: { 'v5.tar.gz': { cwd: 'panel-v2', paths: ['v5'], exclude: [] } } },
  research: {
    tar: {
      'docprivate.tar.gz': { cwd: '../../../docprivate', paths: ['.'], exclude: [] },
      'panel-v2.tar.gz': { cwd: 'panel-v2', paths: (dir) => ['v8', ...readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile())], exclude: [] },
    },
  },
}

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

function r2() {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((k) => !process.env[k])
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`)
  const env = { ...process.env, AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: 'auto' }
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  return (...args) => {
    const quiet = args[0] === 'cp' ? ['--only-show-errors'] : []
    const res = spawnSync('aws', ['s3', ...args, '--endpoint-url', endpoint, ...quiet],{ env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
    if (res.status !== 0) throw new Error(`aws s3 ${args[0]} failed`)
    return res.stdout
  }
}

const remote = (set) => `s3://${process.env.R2_BUCKET}/${PREFIX}/${set}/`

function stage(name) {
  const set = SETS[name]
  if (!set) throw new Error(`unknown set ${name}; one of ${Object.keys(SETS).join(', ')}`)
  const dir = join(LOCAL, 'data-stage', name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  for (const [to, from] of Object.entries(set.files ?? {})) copyFileSync(join(LOCAL, from), join(dir, to))
  for (const [to, t] of Object.entries(set.tar ?? {})) {
    const cwd = join(LOCAL, t.cwd)
    const paths = typeof t.paths === 'function' ? t.paths(cwd) : t.paths
    const args = ['-czf', join(dir, to), '-C', cwd, ...t.exclude.flatMap((e) => ['--exclude', e]), ...paths]
    if (spawnSync('tar', args, { stdio: 'inherit' }).status !== 0) throw new Error(`tar ${to} failed`)
  }
  const manifest = Object.fromEntries(readdirSync(dir).sort().map((f) => [f, sha(join(dir, f))]))
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ set: name, createdAt: new Date().toISOString(), files: manifest }, null, 1) + '\n')
  return dir
}

function push(name) {
  const dir = stage(name)
  r2()('cp', dir, remote(name), '--recursive')
  console.log(`pushed ${name}: ${readdirSync(dir).length} files`)
}

function pull(name) {
  const dir = join(LOCAL, 'data', name)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  r2()('cp', remote(name), dir, '--recursive')
  const { files } = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  const bad = Object.entries(files).filter(([f, h]) => !existsSync(join(dir, f)) || sha(join(dir, f)) !== h).map(([f]) => f)
  if (bad.length) throw new Error(`hash mismatch: ${bad.join(', ')}`)
  console.log(`pulled ${name} → ${dir} (${Object.keys(files).length} files verified)`)
}

const [cmd, name] = process.argv.slice(2)
if (cmd === 'push') push(name)
else if (cmd === 'pull') pull(name)
else if (cmd === 'stage') console.log(stage(name))
else if (cmd === 'list') process.stdout.write(r2()('ls', `s3://${process.env.R2_BUCKET}/${PREFIX}/`, '--recursive'))
else throw new Error('usage: data.mjs pull|push|stage <set> | list')

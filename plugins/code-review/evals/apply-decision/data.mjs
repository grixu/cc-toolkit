#!/usr/bin/env node
// Moves the private apply-decision data between the git-ignored local/ folder and a Cloudflare R2 bucket.
//
//   node plugins/code-review/evals/apply-decision/data.mjs push v1   # the owner's machine only
//   node plugins/code-review/evals/apply-decision/data.mjs pull v1   # → local/, hashes verified
//   node plugins/code-review/evals/apply-decision/data.mjs list
//
// Needs the aws CLI and R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. A set is one tarball of
// local/ plus manifest.json with its sha256; pull refuses a tarball whose hash differs.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCAL = join(import.meta.dirname, 'local')
const STAGE = join(import.meta.dirname, '../.results/apply-decision-data')
const PREFIX = 'code-review/apply-decision'
const TARBALL = 'local.tar.gz'

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

function r2() {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((k) => !process.env[k])
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`)
  const env = { ...process.env, AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: 'auto' }
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  return (...args) => {
    const quiet = args[0] === 'cp' ? ['--only-show-errors'] : []
    const res = spawnSync('aws', ['s3', ...args, '--endpoint-url', endpoint, ...quiet], { env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
    if (res.status !== 0) throw new Error(`aws s3 ${args[0]} failed`)
    return res.stdout
  }
}

const remote = (set) => `s3://${process.env.R2_BUCKET}/${PREFIX}/${set}/`

function push(set) {
  const dir = join(STAGE, set)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (spawnSync('tar', ['-czf', join(dir, TARBALL), '-C', LOCAL, '.'], { stdio: 'inherit' }).status !== 0) throw new Error('tar failed')
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ set, createdAt: new Date().toISOString(), files: { [TARBALL]: sha(join(dir, TARBALL)) } }, null, 1) + '\n')
  r2()('cp', dir, remote(set), '--recursive')
  console.log(`pushed ${set}: ${readdirSync(dir).join(', ')}`)
}

function pull(set) {
  const dir = join(STAGE, set)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  r2()('cp', remote(set), dir, '--recursive')
  const { files } = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  if (sha(join(dir, TARBALL)) !== files[TARBALL]) throw new Error(`hash mismatch: ${TARBALL}`)
  mkdirSync(LOCAL, { recursive: true, mode: 0o700 })
  if (spawnSync('tar', ['-xzf', join(dir, TARBALL), '-C', LOCAL], { stdio: 'inherit' }).status !== 0) throw new Error('untar failed')
  console.log(`pulled ${set} → ${LOCAL}`)
}

const [cmd, set] = process.argv.slice(2)
if (cmd === 'push' && set) push(set)
else if (cmd === 'pull' && set) pull(set)
else if (cmd === 'list') process.stdout.write(r2()('ls', `s3://${process.env.R2_BUCKET}/${PREFIX}/`, '--recursive'))
else throw new Error('usage: data.mjs push|pull <set> | list')

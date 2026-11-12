#!/usr/bin/env node
// Moves the code-review eval fixtures between the git-ignored evals folders and a Cloudflare R2 bucket.
//
//   node plugins/code-review/evals/data.mjs pull    # fetch the tarball fixtures.sha256 pins, verify it, unpack
//   node plugins/code-review/evals/data.mjs push    # pack the local fixtures, upload them, repin fixtures.sha256
//   node plugins/code-review/evals/data.mjs list
//
// Needs the aws CLI and R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.
// Tarballs are stored under their own sha256, so every commit pulls the fixtures its evals were written against.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIRS = ['cases', 'comment-track', 'scope-mix']
const PIN = join(HERE, 'fixtures.sha256')
const MARKER = join(HERE, '.fixtures-sha')
const PREFIX = 'code-review/fixtures'

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8').trim() : '')

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

const remote = (hash) => `s3://${process.env.R2_BUCKET}/${PREFIX}/${hash}.tar.gz`

function tar(args) {
  if (spawnSync('tar', args, { stdio: 'inherit' }).status !== 0) throw new Error(`tar ${args[0]} failed`)
}

function push() {
  const absent = DIRS.filter((d) => !existsSync(join(HERE, d)))
  if (absent.length) throw new Error(`nothing to pack: ${absent.join(', ')} missing; pull first`)
  const tmp = join(HERE, '.fixtures-stage.tar.gz')
  tar(['-czf', tmp, '-C', HERE, ...DIRS])
  const hash = sha(tmp)
  r2()('cp', tmp, remote(hash))
  rmSync(tmp)
  writeFileSync(PIN, hash + '\n')
  writeFileSync(MARKER, hash + '\n')
  console.log(`pushed fixtures ${hash}; commit fixtures.sha256`)
}

function pull() {
  const hash = read(PIN)
  if (!hash) throw new Error('fixtures.sha256 is empty')
  if (read(MARKER) === hash && DIRS.every((d) => existsSync(join(HERE, d)))) return console.log(`fixtures ${hash.slice(0, 12)} already in place`)
  const tmp = join(HERE, '.fixtures-pull.tar.gz')
  r2()('cp', remote(hash), tmp)
  if (sha(tmp) !== hash) {
    rmSync(tmp)
    throw new Error(`hash mismatch for ${hash}`)
  }
  // Fixtures edited locally but not pushed yet survive a pin change in .fixtures-prev/.
  const prev = join(HERE, '.fixtures-prev')
  rmSync(prev, { recursive: true, force: true })
  for (const d of DIRS.filter((d) => existsSync(join(HERE, d)))) {
    mkdirSync(prev, { recursive: true })
    renameSync(join(HERE, d), join(prev, d))
  }
  tar(['-xzf', tmp, '-C', HERE])
  rmSync(tmp)
  writeFileSync(MARKER, hash + '\n')
  console.log(`pulled fixtures ${hash.slice(0, 12)} → ${DIRS.join(', ')}`)
}

const [cmd] = process.argv.slice(2)
if (cmd === 'pull') pull()
else if (cmd === 'push') push()
else if (cmd === 'list') process.stdout.write(r2()('ls', `s3://${process.env.R2_BUCKET}/${PREFIX}/`))
else throw new Error('usage: data.mjs pull|push|list')

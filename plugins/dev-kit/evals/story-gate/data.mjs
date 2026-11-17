#!/usr/bin/env node
// Moves the private story-gate data between the git-ignored local/ and .results/story-gate/ folders and a
// Cloudflare R2 bucket.
//
//   node plugins/dev-kit/evals/story-gate/data.mjs push v1   # the owner's machine only
//   node plugins/dev-kit/evals/story-gate/data.mjs pull v1   # → local/ and .results/story-gate/, hashes verified
//   node plugins/dev-kit/evals/story-gate/data.mjs list
//
// Needs the aws CLI and R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. A set is one tarball per
// folder plus manifest.json with their sha256; pull refuses a tarball whose hash differs. The bare clones are left
// out: extract.mjs fetches them again.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dirname
const STAGE = join(HERE, '../.results/story-gate-data')
const PREFIX = 'dev-kit/story-gate'
const TARBALLS = {
  'local.tar.gz': { dir: join(HERE, 'local'), exclude: ['./clones'] },
  'results.tar.gz': { dir: join(HERE, '../.results/story-gate'), exclude: [] },
}

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
  const stage = join(STAGE, set)
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true, mode: 0o700 })
  for (const [name, { dir, exclude }] of Object.entries(TARBALLS)) {
    const args = ['-czf', join(stage, name), ...exclude.flatMap((e) => ['--exclude', e]), '-C', dir, '.']
    if (spawnSync('tar', args, { stdio: 'inherit' }).status !== 0) throw new Error(`tar ${name} failed`)
  }
  const files = Object.fromEntries(Object.keys(TARBALLS).map((name) => [name, sha(join(stage, name))]))
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify({ set, createdAt: new Date().toISOString(), files }, null, 1) + '\n')
  r2()('cp', stage, remote(set), '--recursive')
  console.log(`pushed ${set}: ${readdirSync(stage).join(', ')}`)
}

function pull(set) {
  const stage = join(STAGE, set)
  mkdirSync(stage, { recursive: true, mode: 0o700 })
  r2()('cp', remote(set), stage, '--recursive')
  const { files } = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'))
  const bad = Object.keys(TARBALLS).filter((name) => sha(join(stage, name)) !== files[name])
  if (bad.length) throw new Error(`hash mismatch: ${bad.join(', ')}`)
  for (const [name, { dir }] of Object.entries(TARBALLS)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    if (spawnSync('tar', ['-xzf', join(stage, name), '-C', dir], { stdio: 'inherit' }).status !== 0) throw new Error(`untar ${name} failed`)
  }
  console.log(`pulled ${set} → local/ and .results/story-gate/`)
}

const [cmd, set] = process.argv.slice(2)
if (cmd === 'push' && set) push(set)
else if (cmd === 'pull' && set) pull(set)
else if (cmd === 'list') process.stdout.write(r2()('ls', `s3://${process.env.R2_BUCKET}/${PREFIX}/`, '--recursive'))
else throw new Error('usage: data.mjs push|pull <set> | list')

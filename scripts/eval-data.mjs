#!/usr/bin/env node
// Moves private eval data between git-ignored folders in plugins/<plugin>/evals/ and a Cloudflare R2 bucket.
//
//   pnpm eval:data pull [target…]   # fetch the tarball each eval-data.json pins, verify it, unpack
//   pnpm eval:data push <target…>   # pack the local data, upload it, repin eval-data.json (commit the pin)
//   pnpm eval:data list [target…]
//
// A target is <plugin> or <plugin>/<suite>, naming plugins/<plugin>/evals[/<suite>]/eval-data.json:
//   { "prefix": "fd3/real-runs", "root": "local", "paths": ["cases", "cases.jsonl"], "sha256": "<pinned tarball>" }
// `root` is relative to the config's folder and `paths` to `root`. `paths` names the data folders, never `.`, so the
// experiment folders kept beside them in local/ stay out of the tarball and a pull never moves them. Pull and list without a target act on every config.
// Needs the aws CLI and R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in the environment: CI sets
// them, and `pnpm eval:data` exports them through scripts/with-r2-keys.sh. Tarballs are stored as
// <prefix>/<sha256>.tar.gz, so every commit pulls the data its evals were written against.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS = join(REPO, 'plugins')
const CONFIG = 'eval-data.json'

const sha = (path) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8').trim() : '')

function configs() {
  const found = []
  for (const plugin of readdirSync(PLUGINS)) {
    const evals = join(PLUGINS, plugin, 'evals')
    if (!existsSync(evals)) continue
    if (existsSync(join(evals, CONFIG))) found.push(plugin)
    for (const suite of readdirSync(evals, { withFileTypes: true })) {
      if (suite.isDirectory() && existsSync(join(evals, suite.name, CONFIG))) found.push(`${plugin}/${suite.name}`)
    }
  }
  return found
}

function load(target) {
  const [plugin, suite] = target.split('/')
  const dir = join(PLUGINS, plugin, 'evals', ...(suite ? [suite] : []))
  const file = join(dir, CONFIG)
  if (!existsSync(file)) throw new Error(`no ${CONFIG} for ${target}; known targets: ${configs().join(', ')}`)
  const cfg = JSON.parse(readFileSync(file, 'utf8'))
  return { target, dir, file, cfg, root: join(dir, cfg.root ?? '.'), marker: join(dir, '.eval-data-sha') }
}

const R2_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']

function requireKeys() {
  const missing = R2_VARS.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`missing ${missing.join(', ')}; run through pnpm eval:data, and create the missing key file with: bash scripts/r2-secrets-init.sh`)
  }
}

function r2() {
  requireKeys()
  const env = { ...process.env, AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: 'auto' }
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  return (...args) => {
    const quiet = args[0] === 'cp' ? ['--only-show-errors'] : []
    const res = spawnSync('aws', ['s3', ...args, '--endpoint-url', endpoint, ...quiet], { env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
    if (res.status !== 0) throw new Error(`aws s3 ${args[0]} failed`)
    return res.stdout
  }
}

const remote = (s, hash) => `s3://${process.env.R2_BUCKET}/${s.cfg.prefix}/${hash}.tar.gz`

function tar(args) {
  if (spawnSync('tar', args, { stdio: 'inherit' }).status !== 0) throw new Error(`tar ${args[0]} failed`)
}

async function push(s) {
  const absent = s.cfg.paths.filter((p) => !existsSync(join(s.root, p)))
  if (absent.length) throw new Error(`${s.target}: nothing to pack, ${absent.join(', ')} missing under ${relative(REPO, s.root)}; pull first`)
  const tmp = join(s.dir, '.eval-data-stage.tar.gz')
  tar(['-czf', tmp, '-C', s.root, ...s.cfg.paths])
  const hash = await sha(tmp)
  r2()('cp', tmp, remote(s, hash))
  rmSync(tmp)
  writeFileSync(s.file, JSON.stringify({ ...s.cfg, sha256: hash }, null, 2) + '\n')
  writeFileSync(s.marker, hash + '\n')
  console.log(`${s.target}: pushed ${hash}; commit ${relative(REPO, s.file)}`)
}

async function pull(s) {
  const hash = s.cfg.sha256
  if (!hash) throw new Error(`${s.target}: ${relative(REPO, s.file)} pins nothing yet; push it first`)
  if (read(s.marker) === hash && s.cfg.paths.every((p) => existsSync(join(s.root, p)))) return console.log(`${s.target}: ${hash.slice(0, 12)} already in place`)
  const tmp = join(s.dir, '.eval-data-pull.tar.gz')
  r2()('cp', remote(s, hash), tmp)
  if ((await sha(tmp)) !== hash) {
    rmSync(tmp)
    throw new Error(`${s.target}: hash mismatch for ${hash}`)
  }
  // A fresh backup per pull, never deleted, so no round of branch switches can overwrite unpushed edits.
  const prev = join(s.dir, `.eval-data-prev-${(read(s.marker) || 'unpinned').slice(0, 12)}-${Date.now()}`)
  for (const p of s.cfg.paths.filter((p) => existsSync(join(s.root, p)))) {
    mkdirSync(dirname(join(prev, p)), { recursive: true })
    renameSync(join(s.root, p), join(prev, p))
  }
  mkdirSync(s.root, { recursive: true, mode: 0o700 })
  tar(['-xzf', tmp, '-C', s.root])
  rmSync(tmp)
  writeFileSync(s.marker, hash + '\n')
  console.log(`${s.target}: pulled ${hash.slice(0, 12)} → ${relative(REPO, s.root)}`)
}

const [cmd, ...targets] = process.argv.slice(2)
if (!['pull', 'push', 'list'].includes(cmd)) throw new Error('usage: eval-data.mjs pull|push|list [<plugin>[/<suite>]…]')
if (cmd === 'push' && !targets.length) throw new Error(`push needs a target; known targets: ${configs().join(', ')}`)
for (const s of (targets.length ? targets : configs()).map(load)) {
  if (cmd === 'pull') await pull(s)
  else if (cmd === 'push') await push(s)
  else process.stdout.write(r2()('ls', `s3://${process.env.R2_BUCKET}/${s.cfg.prefix}/`))
}

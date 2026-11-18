#!/usr/bin/env node
// Checks every plugin's manifests, marketplace entry, changelog and the hand-copied
// decision-model files. Prints each failure and exits 1, or prints OK.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim()
const read = (p) => readFileSync(join(root, p), 'utf8')
const json = (p) => JSON.parse(read(p))
const tracked = execFileSync('git', ['ls-files', 'plugins'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)

// Copies of the decision-model client: each plugin's mod loads only its own files.
const COPIED = ['hooks/decision.ts', 'hooks/providers/gemini.ts', 'hooks/providers/index.ts', 'hooks/providers/typesafe.ts']
const COPY_HOLDERS = ['code-review', 'collegium', 'dev-kit', 'pr-proof']
const MANIFEST_KEYS = ['name', 'version', 'description', 'author', 'repository', 'keywords']

const fail = []
const marketplace = json('.claude-plugin/marketplace.json')
const entries = new Map(marketplace.plugins.map((p) => [p.name, p]))
const plugins = readdirSync(join(root, 'plugins')).filter((d) => statSync(join(root, 'plugins', d)).isDirectory()).sort()
const authors = new Map()
const sentences = (text) => text.trim().split(/(?<=[.!?])\s+(?=\S)/).length

for (const n of plugins) {
  const dir = `plugins/${n}`
  for (const req of ['.claude-plugin/plugin.json', 'CHANGELOG.md', 'README.md']) {
    if (!existsSync(join(root, dir, req))) fail.push(`${n}: missing ${req}`)
  }
  for (const f of tracked) {
    if (f.startsWith(`${dir}/`) && f.endsWith('/CLAUDE.md') && !f.split('/').includes('fixtures')) {
      fail.push(`${f}: a CLAUDE.md inside a plugin ships with it and is never loaded; move it to .claude/rules/`)
    }
  }
  if (!existsSync(join(root, dir, '.claude-plugin/plugin.json'))) continue
  const p = json(`${dir}/.claude-plugin/plugin.json`)
  for (const k of MANIFEST_KEYS) if (!p[k] || (Array.isArray(p[k]) && !p[k].length)) fail.push(`${n}: plugin.json missing ${k}`)
  if (p.name !== n) fail.push(`${n}: plugin.json name is ${JSON.stringify(p.name)}`)
  if (!/^\d+\.\d+\.\d+$/.test(String(p.version ?? ''))) fail.push(`${n}: version ${JSON.stringify(p.version)} is not semver`)
  if (p.description && sentences(p.description) > 2) fail.push(`${n}: description has more than two sentences`)
  authors.set(`${n}/plugin.json`, JSON.stringify(p.author))
  const codex = `${dir}/.codex-plugin/plugin.json`
  if (existsSync(join(root, codex))) {
    const c = json(codex)
    for (const k of MANIFEST_KEYS) {
      if (JSON.stringify(c[k]) !== JSON.stringify(p[k])) fail.push(`${n}: .codex-plugin/plugin.json ${k} differs from .claude-plugin/plugin.json`)
    }
  }
  const e = entries.get(n)
  if (!e) {
    fail.push(`${n}: not registered in marketplace.json`)
    continue
  }
  if (e.source !== `./plugins/${n}`) fail.push(`${n}: marketplace source is ${JSON.stringify(e.source)}`)
  if (e.description !== p.description) fail.push(`${n}: marketplace description differs from plugin.json`)
  authors.set(`${n}/marketplace`, JSON.stringify(e.author))
  const changelog = join(root, dir, 'CHANGELOG.md')
  if (existsSync(changelog) && !readFileSync(changelog, 'utf8').includes('## [Unreleased]')) {
    fail.push(`${n}: CHANGELOG.md has no ## [Unreleased] section (release.sh needs it)`)
  }
}

for (const name of entries.keys()) if (!plugins.includes(name)) fail.push(`marketplace entry ${name} points at no plugin`)

const spellings = new Map()
for (const [who, spelling] of authors) spellings.set(spelling, [...(spellings.get(spelling) ?? []), who])
if (spellings.size > 1) {
  fail.push('author drift: every plugin.json and marketplace entry must carry byte-identical author:')
  for (const [spelling, who] of spellings) fail.push(`    ${spelling}  <- ${who.sort().join(', ')}`)
}

for (const file of COPIED) {
  const [first, ...rest] = COPY_HOLDERS
  const ref = read(`plugins/${first}/${file}`)
  for (const n of rest) if (read(`plugins/${n}/${file}`) !== ref) fail.push(`plugins/${n}/${file} differs from plugins/${first}/${file}; the copies must stay identical`)
}

console.log(fail.length ? fail.join('\n') : 'OK — all plugins consistent')
process.exit(fail.length ? 1 : 0)

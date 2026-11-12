#!/usr/bin/env node
// Builds <dir>/story.html from <dir>/story.json, <dir>/chapters/*.html and <dir>/diagrams/,
// filling every fact git can answer, then runs check.mjs on the result.
// Usage: node assemble.mjs <dir>   (run inside the repository the story describes)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { check, report } from './check.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dir = process.argv[2]
if (!dir) fail('usage: node assemble.mjs <story-dir>')

const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'))
const languages = story.languages?.length ? story.languages : ['en']
if (languages[0] !== 'en') fail('story.json: languages must start with "en"')
if (!story.base) fail('story.json: "base" (the ref the change is measured against) is required')
for (const l of languages) if (!story.title?.[l]) fail(`story.json: title.${l} is missing`)

const uiBuiltIn = JSON.parse(readFileSync(join(here, '../references/ui.json'), 'utf8'))
const ui = {}
for (const l of languages) {
  ui[l] = { ...uiBuiltIn.en, ...uiBuiltIn[l], ...story.ui?.[l] }
  if (l !== 'en' && !uiBuiltIn[l]) {
    const missing = Object.keys(uiBuiltIn.en).filter((k) => !story.ui?.[l]?.[k])
    if (missing.length) fail(`story.json: no built-in labels for "${l}"; add ui.${l} with ${missing.join(', ')}`)
  }
}

const headRef = story.head || 'HEAD'
const uncommitted = story.uncommitted === true
if (uncommitted && headRef !== 'HEAD') fail('story.json: uncommitted changes can only be told with head "HEAD"')
const head = git('rev-parse', `${headRef}^{commit}`)
const baseSha = git('merge-base', story.base, head)
const branch = story.branch || git('branch', '--show-current') || head.slice(0, 12)
const repo = repoName()
const stats = numstat()

let chapters = readdirSync(join(dir, 'chapters'))
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((f) => readFileSync(join(dir, 'chapters', f), 'utf8'))
  .join('\n')
chapters = inlineDiagrams(chapters)
chapters = fillCast(chapters)

const added = stats.reduce((s, f) => s + f.added, 0)
const removed = stats.reduce((s, f) => s + f.removed, 0)
const stack = Array.isArray(story.stack) ? story.stack.map(Number).filter(Boolean) : []
const where = stack.length > 1
  ? `${repo} · ${stack.map((n) => `#${n}`).join(' → ')}`
  : story.pr ? `${repo}#${story.pr}` : `${repo} · ${branch} → ${story.base.replace(/^origin\//, '')}`
const fileCount = `${stats.length} ${stats.length === 1 ? 'file' : 'files'}`
const uncommittedNote = uncommitted ? ' · incl. uncommitted' : ''
const source = `${where} · +${added} / −${removed} · ${fileCount}${uncommittedNote}`

const meta = {
  repo, branch, base: story.base, 'base-sha': baseSha, head,
  pr: story.pr ? String(story.pr) : '', stack: stack.join(','), languages: languages.join(','),
  uncommitted: String(uncommitted), generated: new Date().toISOString(),
}
const heading = languages.length > 1
  ? languages.map((l) => `<span data-lang="${l}">${escape(story.title[l])}</span>`).join('')
  : escape(story.title.en)

// Function replacers, so a "$&" or "$1" in a title or chapter is inserted literally.
const html = readFileSync(join(here, '../references/template.html'), 'utf8')
  .replace('{{TITLE}}', () => escape(story.title.en))
  .replace('{{META}}', () => Object.entries(meta).map(([k, v]) => `<meta name="code-story:${k}" content="${escape(v)}">`).join('\n'))
  .replace('{{HEADING}}', () => heading)
  .replace('{{SOURCE}}', () => escape(source))
  .replace('{{CHAPTERS}}', () => chapters)
  // Escape "<" so a "</script>" inside a label cannot close the JSON script block.
  .replace('{{I18N}}', () => JSON.stringify(ui).replace(/</g, '\\u003c'))

const out = join(dir, 'story.html')
writeFileSync(out, html)
const result = check(html)
console.log(`${out}\n${report(result)}`)
process.exit(result.errors.length ? 1 : 0)

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).trim()
  } catch (e) {
    fail(`git ${args.join(' ')} failed: ${String(e.stderr || e.message).trim()}`)
  }
}

function repoName() {
  const url = git('remote', 'get-url', 'origin')
  return url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)?.[1] ?? url
}

function numstat() {
  const range = uncommitted ? [baseSha] : [baseSha, head]
  return git('diff', '--numstat', '--no-renames', ...range)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [a, d, ...path] = line.split('\t')
      return { path: path.join('\t'), added: a === '-' ? 0 : Number(a), removed: d === '-' ? 0 : Number(d) }
    })
}

// <figure class="svg" data-src="diagrams/name.svg"> takes diagrams/name.svg, or one diagrams/name.<lang>.svg per language.
function inlineDiagrams(source) {
  let figure = 0
  return source.replace(/<figure\b([^>]*)\bdata-src="([^"]+)"([^>]*)>/g, (_, before, src, after) => {
    figure++
    const file = join(dir, src)
    const variants = existsSync(file)
      ? [[null, file]]
      : languages.map((l) => [l, file.replace(/\.svg$/, `.${l}.svg`)])
    for (const [, path] of variants) if (!existsSync(path)) fail(`diagram ${path} does not exist`)
    const body = variants
      .map(([l, path]) => `<div class="canvas"${l ? ` data-lang="${l}"` : ''}>${cleanSvg(readFileSync(path, 'utf8'), `d${figure}${l ?? ''}-`)}</div>`)
      .join('')
    return `<figure${before}${after}>${body}`
  })
}

function cleanSvg(svg, prefix) {
  let out = svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .trim()
  // A second copy of an id in the page would make every url(#id) resolve to the first one.
  const ids = [...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  for (const id of ids) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out
      .replace(new RegExp(`\\bid="${safe}"`, 'g'), `id="${prefix}${id}"`)
      .replace(new RegExp(`url\\(#${safe}\\)`, 'g'), `url(#${prefix}${id})`)
      .replace(new RegExp(`href="#${safe}"`, 'g'), `href="#${prefix}${id}"`)
  }
  return out
}

// <li data-file="path"> gets its +N / −N from git; a path the change does not touch is flagged for check.mjs.
function fillCast(source) {
  source = source.replace(/<span class="k" data-stat="([^"]+)"><\/span>/g, (tag, path) => {
    const f = stats.find((s) => s.path === path)
    return f ? `<span class="k" data-stat="${path}">+${f.added} −${f.removed}</span>` : `<span class="k" data-stat="${path}" data-missing></span>`
  })
  return source.replace(/<li\b([^>]*)\bdata-file="([^"]+)"([^>]*)>/g, (tag, before, path, after) => {
    const f = stats.find((s) => s.path === path)
    if (!f) return `<li${before}data-file="${path}" data-missing${after}>`
    return `${tag}<code class="cf">${escape(path)}</code> <span class="st">(+${f.added} / −${f.removed})</span> `
  })
}

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fail(message) {
  console.error(message)
  process.exit(2)
}

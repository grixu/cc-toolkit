#!/usr/bin/env node
// Turns a published story back into the files assemble.mjs builds from, so an update edits
// only the chapters the new commits touch.
// Usage: node unpack.mjs <story.html> <dir>   -> <dir>/story.json, <dir>/chapters/NN.html, <dir>/previous.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [file, dir] = process.argv.slice(2)
if (!file || !dir) {
  console.error('usage: node unpack.mjs <story.html> <dir>')
  process.exit(2)
}
const html = readFileSync(file, 'utf8')

const meta = {}
for (const [, name, content] of html.matchAll(/<meta name="code-story:([a-z-]+)" content="([^"]*)">/g)) meta[name] = unescape(content)
if (!meta.head) {
  console.error(`${file} is not a code story: it has no code-story:head meta`)
  process.exit(1)
}

const languages = meta.languages.split(',')
const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? ''
const title = {}
for (const l of languages) {
  const spanText = h1.match(new RegExp(`<span data-lang="${l}">([\\s\\S]*?)</span>`))?.[1]
  title[l] = unescape(spanText ?? h1.replace(/<[^>]*>/g, ''))
}
const builtIn = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../references/ui.json'), 'utf8'))
const pageUi = JSON.parse(html.match(/<script type="application\/json" id="i18n">([\s\S]*?)<\/script>/)?.[1] ?? '{}')
const ui = Object.fromEntries(Object.entries(pageUi).filter(([l]) => !builtIn[l]))

const main = html.slice(html.indexOf('<main>') + '<main>'.length, html.lastIndexOf('</main>'))
const chapters = [...main.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((m) =>
  m[0]
    .replace(/<code class="cf">[\s\S]*?<\/code> <span class="st">[^<]*<\/span> /g, '')
    .replace(/(<span class="k" data-stat="[^"]+">)[^<]*<\/span>/g, '$1</span>')
    .replace(/ data-missing/g, ''),
)

mkdirSync(join(dir, 'chapters'), { recursive: true })
chapters.forEach((c, k) => writeFileSync(join(dir, 'chapters', `${String(k + 1).padStart(2, '0')}.html`), c + '\n'))
const story = {
  base: meta.base,
  languages,
  title,
  pr: meta.pr ? Number(meta.pr) : null,
  stack: meta.stack ? meta.stack.split(',').map(Number) : [],
  branch: meta.branch,
  uncommitted: meta.uncommitted === 'true',
  ui,
}
writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2) + '\n')
writeFileSync(join(dir, 'previous.json'), JSON.stringify(meta, null, 2) + '\n')
console.log(`${chapters.length} chapters from ${meta.repo} ${meta.branch} @ ${meta.head.slice(0, 12)} -> ${dir}`)

function unescape(s) {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

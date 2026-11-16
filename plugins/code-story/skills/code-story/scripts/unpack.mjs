#!/usr/bin/env node
// Turns a published story back into the files assemble.mjs builds from, so an update edits
// only the chapters the new commits touch.
// Usage: node unpack.mjs <story.html> <dir>   -> <dir>/story.json, <dir>/chapters/NN.html, <dir>/previous.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStory } from './parse-story.mjs'

const [file, dir] = process.argv.slice(2)
if (!file || !dir) {
  console.error('usage: node unpack.mjs <story.html> <dir>')
  process.exit(2)
}
const builtIn = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../references/ui.json'), 'utf8'))
const parsed = parseStory(readFileSync(file, 'utf8'), builtIn)
if (!parsed) {
  console.error(`${file} is not a code story: it has no code-story:head meta`)
  process.exit(1)
}
const { meta, story, chapters } = parsed

mkdirSync(join(dir, 'chapters'), { recursive: true })
chapters.forEach((c, k) => writeFileSync(join(dir, 'chapters', `${String(k + 1).padStart(2, '0')}.html`), c + '\n'))
writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2) + '\n')
writeFileSync(join(dir, 'previous.json'), JSON.stringify(meta, null, 2) + '\n')
console.log(`${chapters.length} chapters from ${meta.repo} ${meta.branch} @ ${meta.head.slice(0, 12)} -> ${dir}`)

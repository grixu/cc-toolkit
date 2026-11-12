#!/usr/bin/env node
// Lists mechanical AI-writing tells in a Markdown, HTML or text file. Leads, not verdicts: the model judges each hit.
// Usage: node scan.mjs <file> [--lang en|pl]   (default: both lexicons)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REFERENCES = join(dirname(fileURLToPath(import.meta.url)), '..', 'references')
const WORD_START ='(?<![\\p{L}\\p{N}_])'
const PLACEHOLDER = '.{1,60}?'
// Each spans a whole line with `.*` and matches most ordinary sentences; the model catches the real cases.
const TOO_BROAD = new Set(['\\bfrom\\b.*\\bto\\b', '\\bwhether\\b.*\\bor\\b'])
// These rows describe a shape in words; no string matches them.
const DESCRIBED = /e\.g\.|^"|Each paragraph|Bulleted list|Uniform sentence|Repeated |Short clipped|Triplet|Staccato|Asyndeton|Step‑by‑step|Firstly/

export function scan(text, { langs = ['en', 'pl'] } = {}) {
  const prose = mask(text)
  const lines = prose.split('\n')
  const raw = text.split('\n')
  const hits = []
  const seen = new Set()
  const add = (line, col, kind, match) => {
    // A regex row and a literal row often catch the same words; report the spot once.
    const key = `${line}:${col}:${match.toLowerCase()}`
    if (!seen.has(key)) seen.add(key), hits.push({ line: line + 1, col: col + 1, kind, match })
  }

  const rules = langs.flatMap((lang) => lexicon(lang))
  lines.forEach((line, i) => {
    for (const rule of rules)
      for (const m of line.matchAll(rule.re)) add(i, m.index, rule.kind, m[0].trim())

    for (const m of line.matchAll(/—|\s–\s|\s--\s/g)) add(i, m.index, 'Dash as connector', m[0].trim())
    for (const m of line.matchAll(/“[^”\n]*”?/g)) add(i, m.index, 'Curly quotes', m[0].slice(0, 40))

    const source = raw[i]
    if (/^\s*([-*+]|\d+\.)\s+\*\*[^*]+(:\*\*|\*\*:)/.test(source)) add(i, 0, 'Bold label list item', source.trim().slice(0, 60))
    const heading = source.match(/^#{1,6}\s+(.+)$/)
    if (heading && isTitleCase(heading[1])) add(i, 0, 'Title Case heading', heading[1])
    if ((heading || /^\s*[-*+]\s/.test(source)) && /\p{Extended_Pictographic}/u.test(source))
      add(i, 0, 'Emoji in heading or bullet', source.trim().slice(0, 60))
  })
  return hits.sort((a, b) => a.line - b.line || a.col - b.col)
}

function lexicon(lang) {
  const rows = parseCsv(readFileSync(join(REFERENCES, `lexicon-${lang}.csv`), 'utf8'))
  const rules = []
  for (const row of rows) {
    const [category, sub, example] = row
    if (!example || category.startsWith('Structure/') || DESCRIBED.test(example)) continue
    if (category.startsWith('Rhetoric/') && sub !== 'Exhausted metaphor') continue
    if (sub === 'Regex') {
      if (!TOO_BROAD.has(example)) rules.push({ kind: `${lang}: pattern`, re: new RegExp(example, 'giu') })
      continue
    }
    for (const phrase of example.split(/\s+\|\s+|\s+\/\s+/)) {
      const source = literal(phrase, lang)
      if (source) rules.push({ kind: `${lang}: ${sub}`, re: new RegExp(source, 'giu') })
    }
  }
  return rules
}

function literal(phrase, lang) {
  const bare = phrase.replace(/\s*\([^|)]*\s[^|)]*\)/g, '').trim()
  if (bare.length < 3) return null
  // A template made mostly of placeholders ("While [X], [Y]") matches ordinary prose everywhere.
  const fixed = bare.replace(/\[[^\]]+\]/g, '').replace(/[^\p{L}]/gu, '')
  if (bare.includes('[') && fixed.length < 10) return null
  const parts = bare.split(/(\[[^\]]+\])/).map((part) =>
    /^\[[^\]]+\]$/.test(part)
      ? PLACEHOLDER
      : part
          .replace(/[.*+?^${}\\]/g, '\\$&')
          .replace(/'/g, "['’]")
          .replace(/\s+/g, '\\s+'),
  )
  const single = !/\s|\[/.test(bare)
  // Polish entries are stems and English single words take inflections (enhance → enhanced); an entry with a
  // (a|b) group lists its whole forms, so `(stanowi|stanowią)` does not also match `stanowisko`.
  const tail = (single || lang === 'pl') && !bare.includes('(') ? '\\p{L}*' : '(?![\\p{L}])'
  return WORD_START + parts.join('') + tail
}

function isTitleCase(title) {
  const words = title.replace(/[`*_]/g, '').split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  const longer = words.slice(1).filter((w) => w.length > 3)
  return longer.length >= 2 && longer.every((w) => /^\p{Lu}/u.test(w) && !/^\p{Lu}+$/u.test(w))
}

// Blanks code, markup and URLs to spaces so line and column numbers still point into the original file.
function mask(text) {
  const blank = (s) => s.replace(/[^\n]/g, ' ')
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank)
    .replace(/<(pre|code|script|style|svg)\b[\s\S]*?<\/\1>/gi, blank)
    .replace(/^---\n[\s\S]*?\n---(?=\n|$)/, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/<[^>\n]*>/g, blank)
    .replace(/https?:\/\/\S+/g, blank)
    .replace(/\]\([^)\n]*\)/g, blank)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[++i]
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(field), (field = '')
    else if (c === '\n') row.push(field), rows.push(row), (row = []), (field = '')
    else if (c !== '\r') field += c
  }
  if (field || row.length) row.push(field), rows.push(row)
  return rows.slice(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const isPositional = (a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--lang'
  const file = args.find(isPositional)
  const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null
  if (!file || (lang && !['en', 'pl'].includes(lang))) {
    console.error('usage: node scan.mjs <file> [--lang en|pl]')
    process.exit(2)
  }
  const hits = scan(readFileSync(file, 'utf8'), { langs: lang ? [lang] : ['en', 'pl'] })
  for (const h of hits) console.log(`${file}:${h.line}:${h.col}  ${h.kind}  "${h.match}"`)
  const counts = Object.entries(Object.groupBy(hits, (h) => h.kind)).map(([k, v]) => `${k} ${v.length}`)
  console.log(hits.length ? `\n${hits.length} hits: ${counts.join(', ')}` : 'no mechanical hits')
}

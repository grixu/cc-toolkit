#!/usr/bin/env node
// Checks an assembled code story against the repository it describes.
// Usage: node check.mjs <story.html>   (run inside the repository)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ALLOWED_INLINE = /^<\/?(mark|b|em|strong|span)\b[^>]*>/
const KNOWN_TAGS = new Set(
  ('article div span h2 h3 h4 p code pre i b em strong mark ol ul li figure figcaption aside table thead tbody tr th td ' +
    'a br sub sup small kbd details summary blockquote hr svg g rect path text tspan circle ellipse line polyline polygon ' +
    'defs marker title desc lineargradient stop').split(' '),
)
const MAX_LISTED_IDENTIFIERS = 6
const MAX_LINE_MISMATCHES = 3
const COUNTER_RESET = /counter-reset:\s*l\s+(\d+)/
const COUNTER_SET = /counter-set:\s*l\s+(\d+)/

export function check(html, { cwd = process.cwd() } = {}) {
  const errors = []
  const warnings = []
  const meta = readMeta(html)
  const languages = (meta.languages ?? '').split(',').filter(Boolean)

  if (/\{\{(TITLE|META|HEADING|SOURCE|CHAPTERS|I18N)\}\}/.test(html)) errors.push('a template placeholder ({{…}}) is still in the page')
  for (const key of ['repo', 'branch', 'base', 'base-sha', 'head', 'languages'])
    if (!meta[key]) errors.push(`meta code-story:${key} is missing`)
  if (meta.head && !/^[0-9a-f]{40}$/.test(meta.head)) errors.push('meta code-story:head is not a full commit SHA')
  if (/<script\b[^>]*\bsrc=/i.test(html)) errors.push('the page loads an external script; diagrams are inline SVG, not mermaid')
  if (/class="mermaid"/.test(html)) errors.push('a mermaid block is in the page; draw it as an inline SVG figure')

  const git = gitReader(cwd, meta)
  const articles = elements(html, 'article')
  if (!articles.length) errors.push('the page has no <article> chapters')

  articles.forEach((article, index) => {
    const where = `chapter ${index + 1}`
    const outsideSvg = elements(article, 'svg').reduce((html, svg) => html.replace(svg, ''), article)
    const unknown = new Set([...outsideSvg.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase()).filter((t) => !KNOWN_TAGS.has(t)))
    for (const tag of unknown) errors.push(`${where}: <${tag}> is not an HTML tag the story uses; escape a literal "<" as &lt;`)
    checkHeading(article, languages, where, errors)
    checkLanguages(article, languages, where, errors, warnings)
    checkNotes(article, languages, where, errors)
    checkBlocks(article, git, where, errors, warnings)
    checkSvg(article, where, errors)
    for (const tag of article.match(/<(li|span)\b[^>]*data-missing[^>]*>/g) ?? [])
      errors.push(`${where}: ${attr(tag, 'data-file') ?? attr(tag, 'data-stat')} is not a file this change touches`)
  })
  return { errors, warnings }
}

function readMeta(html) {
  const meta = {}
  for (const [, name, content] of html.matchAll(/<meta name="code-story:([a-z-]+)" content="([^"]*)">/g)) meta[name] = content
  return meta
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`))?.slice(1).find((v) => v !== undefined)
}

function openTag(element, name) {
  return element.match(new RegExp(`^<${name}\\b[^>]*>`))[0]
}

// Every element with the given tag name, outermost first, with nesting resolved.
function elements(html, name, filter = () => true) {
  const out = []
  const open = new RegExp(`<${name}\\b[^>]*>`, 'g')
  let m
  while ((m = open.exec(html))) {
    if (!filter(m[0])) continue
    const end = closing(html, name, m.index + m[0].length)
    out.push(html.slice(m.index, end))
  }
  return out
}

function closing(html, name, from) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g')
  re.lastIndex = from
  let depth = 1
  let m
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  return html.length
}

function langElements(html) {
  const out = []
  for (const m of html.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-lang="([^"]+)"[^>]*>/g)) {
    out.push({ lang: m[2], tag: m[1], html: html.slice(m.index, closing(html, m[1], m.index + m[0].length)) })
  }
  return out
}

function checkHeading(article, languages, where, errors) {
  const hd = elements(article, 'div', (t) => /class="hd"/.test(t))[0]
  if (!hd) return errors.push(`${where}: no <div class="hd"> header`)
  const h2s = [...hd.matchAll(/<h2\b([^>]*)>/g)].map((m) => attr(m[0], 'data-lang') ?? '*')
  if (!h2s.length) return errors.push(`${where}: no <h2> title`)
  if (!h2s.includes('*')) for (const l of languages) if (!h2s.includes(l)) errors.push(`${where}: no <h2> title in ${l}`)
}

function checkLanguages(article, languages, where, errors, warnings) {
  const tagged = langElements(article)
  for (const l of new Set(tagged.map((e) => e.lang)))
    if (!languages.includes(l)) errors.push(`${where}: text tagged data-lang="${l}", which is not a story language`)
  if (languages.length < 2) return
  const count = (l) => tagged.filter((e) => e.lang === l).length
  for (const l of languages.slice(1))
    if (count(l) !== count(languages[0]))
      errors.push(`${where}: ${count(languages[0])} ${languages[0]} text blocks but ${count(l)} in ${l}; every tagged block needs its twin`)

  const codes = (l) => new Set(tagged.filter((e) => e.lang === l).flatMap((e) => [...e.html.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => text(m[1]))))
  const english = codes(languages[0])
  for (const l of languages.slice(1)) {
    const missing = [...english].filter((c) => !codes(l).has(c))
    if (missing.length)
      warnings.push(`${where}: identifiers in ${languages[0]} but not in ${l}: ${missing.slice(0, MAX_LISTED_IDENTIFIERS).join(', ')}${missing.length > MAX_LISTED_IDENTIFIERS ? '…' : ''}; keep code names untranslated`)
  }
}

function checkNotes(article, languages, where, errors) {
  const markers = new Set([...article.matchAll(/\bdata-n=["']?(\d+)/g)].map((m) => m[1]))
  const lists = elements(article, 'ol', (t) => /class="nt"/.test(t))
  const perLanguage = languages.length ? languages : ['en']
  for (const l of perLanguage) {
    const own = lists.filter((ol) => {
      const lang = attr(openTag(ol, 'ol'), 'data-lang')
      return !lang || lang === l
    })
    const notes = new Set()
    for (const ol of own) {
      const start = Number(attr(openTag(ol, 'ol'), 'start') ?? 1)
      const count = (ol.match(/<li\b/g) ?? []).length
      for (let k = 0; k < count; k++) notes.add(String(start + k))
    }
    const label = languages.length > 1 ? ` (${l})` : ''
    for (const n of markers) if (!notes.has(n)) errors.push(`${where}${label}: marker data-n=${n} has no note; check the <ol start>`)
    for (const n of notes) if (!markers.has(n)) errors.push(`${where}${label}: note ${n} has no data-n marker in a code block`)
  }
}

function checkBlocks(article, git, where, errors, warnings) {
  for (const dx of elements(article, 'div', (t) => /class="dx"/.test(t))) {
    const pre = dx.match(/<pre class="diff([^"]*)"([^>]*)>/)
    if (!pre) continue
    const [, kinds, preAttrs] = pre
    const head = dx.match(/<div class="dh">([\s\S]*?)<\/div>/)?.[1] ?? ''
    const path = text(head.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? '')
    const label = `${where}, ${path || 'a code block'}`
    const lines = [...dx.matchAll(/<i\b([^>]*)>([\s\S]*?)<\/i\s*>/g)].map((m) => ({
      cls: attr(`<i ${m[1]}>`, 'class') ?? '',
      style: attr(`<i ${m[1]}>`, 'style') ?? '',
      raw: m[2],
    }))
    checkEscaping(lines, label, errors)
    if (kinds.includes('tree')) continue
    checkCounters(preAttrs, lines, label, errors)
    if (/class="tag"/.test(head)) continue
    checkLineNumbers({ base: kinds.includes('base'), path, preAttrs, lines, git, label }, errors, warnings)
  }
}

function checkEscaping(lines, label, errors) {
  for (const line of lines) {
    const bad = line.raw.replace(/<[^>]*>/g, (tag) => (ALLOWED_INLINE.test(tag) ? '' : tag))
    if (/</.test(bad)) errors.push(`${label}: unescaped "<" in a line; write &lt; (${text(line.raw).slice(0, 40)})`)
  }
}

function checkCounters(preAttrs, lines, label, errors) {
  if (!COUNTER_RESET.test(preAttrs)) errors.push(`${label}: <pre class="diff"> lacks style="counter-reset:l N"`)
  for (const line of lines)
    if (line.cls === 'e' && !COUNTER_SET.test(line.style)) errors.push(`${label}: an elision lacks style="counter-set:l N"`)
}

function checkLineNumbers({ base, path, preAttrs, lines, git, label }, errors, warnings) {
  const shown = git.file(base ? 'base' : 'head', path)
  if (!shown) {
    errors.push(`${label}: no such file at ${base ? 'the base' : 'HEAD'}; fix the path, or tag the header (dependency, unchanged) when it is not this repository's file`)
    return
  }
  const other = git.file(base ? 'head' : 'base', path)
  let n = Number(preAttrs.match(COUNTER_RESET)?.[1] ?? 0)
  let wrong = 0
  for (const line of lines) {
    if (line.cls === 'e') {
      n = Number(line.style.match(COUNTER_SET)?.[1] ?? n)
      continue
    }
    const counted = base ? line.cls !== 'a' : line.cls !== 'd'
    const want = normal(text(line.raw))
    if (counted) {
      n++
      if (normal(shown[n - 1] ?? '') !== want) {
        wrong++
        if (wrong <= MAX_LINE_MISMATCHES) errors.push(`${label}: line ${n} reads "${(shown[n - 1] ?? '(past the end)').trim().slice(0, 60)}", not "${want.slice(0, 60)}"`)
      }
    } else if (other && !other.some((l) => normal(l) === want)) {
      warnings.push(`${label}: the ${base ? 'added' : 'removed'} line "${want.slice(0, 50)}" is not in the ${base ? 'new' : 'old'} file`)
    }
  }
  if (wrong > MAX_LINE_MISMATCHES) errors.push(`${label}: ${wrong - MAX_LINE_MISMATCHES} more lines do not match; the counter-reset is probably off`)
}

function checkSvg(article, where, errors) {
  for (const svg of elements(article, 'svg')) {
    const open = openTag(svg, 'svg')
    if (!/viewBox=/.test(open)) errors.push(`${where}: an <svg> has no viewBox, so it will not scale`)
    if (/<script\b|<foreignObject\b|\son[a-z]+=/i.test(svg)) errors.push(`${where}: an <svg> carries script, an event handler or foreignObject`)
    if (/class="fx-node/.test(svg)) checkLiteGeometry(svg, where, errors)
  }
}

const CHAR_WIDTH = { 'fx-label': 7.9, 'fx-sub': 6.6 }

function checkLiteGeometry(svg, where, errors) {
  const num = (tag, name) => Number(attr(tag, name) ?? NaN)
  const boxes = [...svg.matchAll(/<rect\b[^>]*class="fx-node[^"]*"[^>]*>/g)].map((m) => ({
    x: num(m[0], 'x'), y: num(m[0], 'y'), w: num(m[0], 'width'), h: num(m[0], 'height'),
  }))
  if (boxes.some((b) => [b.x, b.y, b.w, b.h].some(Number.isNaN)))
    return errors.push(`${where}: an fx-node <rect> lacks absolute x, y, width or height`)
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
        errors.push(`${where}: diagram boxes at (${a.x},${a.y}) and (${b.x},${b.y}) overlap`)
    }
  for (const m of svg.matchAll(/<text\b([^>]*class="(fx-label|fx-sub)"[^>]*)>([\s\S]*?)<\/text>/g)) {
    const tag = `<text ${m[1]}>`
    const x = num(tag, 'x')
    const y = num(tag, 'y')
    const box = boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
    if (!box) continue
    const variants = [...m[3].matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)].map((t) => text(t[1]))
    for (const label of variants.length ? variants : [text(m[3])]) {
      const width = label.length * CHAR_WIDTH[m[2]]
      const middle = (attr(tag, 'text-anchor') ?? 'start') === 'middle'
      const left = middle ? x - width / 2 : x
      if (left < box.x + 2 || left + width > box.x + box.w - 2)
        errors.push(`${where}: diagram label "${label}" (~${Math.round(width)}px) does not fit its ${box.w}px box; widen the box`)
    }
  }
}

function text(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

function normal(line) {
  return line.trim().replace(/\s+/g, ' ')
}

function gitReader(cwd, meta) {
  const cache = new Map()
  const refs = { base: meta['base-sha'], head: meta.uncommitted === 'true' ? null : meta.head }
  return {
    file(side, path) {
      const key = `${side}:${path}`
      if (!cache.has(key)) cache.set(key, read(side, path))
      return cache.get(key)
    },
  }
  function read(side, path) {
    if (!path) return null
    try {
      const out = refs[side] === null
        ? readFileSync(`${cwd}/${path}`, 'utf8')
        : execFileSync('git', ['show', `${refs[side]}:${path}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 })
      return out.split('\n')
    } catch {
      return null
    }
  }
}

export function report({ errors, warnings }) {
  const lines = []
  for (const e of errors) lines.push(`ERROR  ${e}`)
  for (const w of warnings) lines.push(`warn   ${w}`)
  lines.push(errors.length ? `${errors.length} error(s): fix them before publishing` : 'check passed')
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node check.mjs <story.html>')
    process.exit(2)
  }
  const result = check(readFileSync(file, 'utf8'))
  console.log(report(result))
  process.exit(result.errors.length ? 1 : 0)
}

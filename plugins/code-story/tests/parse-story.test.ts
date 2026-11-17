import { expect, test } from 'claude-code/testing'
import { parseStory } from '../skills/code-story/scripts/parse-story.mjs'

const page = (meta: Record<string, string>) => `<!doctype html><html><head>
${Object.entries(meta)
  .map(([name, content]) => `<meta name="code-story:${name}" content="${content}">`)
  .join('\n')}
<script type="application/json" id="i18n">{"en":{"x":"y"},"de":{"x":"z"}}</script>
</head><body><h1>Retry &amp; backoff</h1><main>
<article data-n="1"><p>One <code class="cf">src/a.ts</code> <span class="st">+3/−1</span> here</p><span class="k" data-stat="added">3</span></article>
<article data-n="2" data-missing><p>Two</p></article>
</main></body></html>`

const META = {
  repo: 'cc-toolkit',
  branch: 'feat/retry',
  head: '0123456789abcdef0123456789abcdef01234567',
  'head-ref': 'origin/feat/retry',
  base: 'origin/main',
  languages: 'en',
  pr: '41',
  stack: '40,41',
  uncommitted: 'false',
}

test('restores head from the head-ref meta', () => {
  const parsed = parseStory(page(META), { en: {} })
  expect(parsed?.story.head).toBe('origin/feat/retry')
  expect(parsed?.story.base).toBe('origin/main')
  expect(parsed?.story.pr).toBe(41)
  expect(parsed?.story.stack).toEqual([40, 41])
})

test('leaves head unset on a page without head-ref', () => {
  const { 'head-ref': _, ...older } = META
  expect(parseStory(page(older), { en: {} })?.story.head).toBe(undefined)
})

test('strips what assemble injects from chapters', () => {
  const parsed = parseStory(page(META), { en: {} })
  expect(parsed?.chapters).toEqual([
    '<article data-n="1"><p>One here</p><span class="k" data-stat="added"></span></article>',
    '<article data-n="2"><p>Two</p></article>',
  ])
  expect(parsed?.story.title).toEqual({ en: 'Retry & backoff' })
  expect(parsed?.story.ui).toEqual({ de: { x: 'z' } })
})

test('a page without a head meta is not a story', () => {
  expect(parseStory('<html><main></main></html>', {})).toBe(null)
})

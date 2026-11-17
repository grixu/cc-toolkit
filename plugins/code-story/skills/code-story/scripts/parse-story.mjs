// Reads a published story page back into the inputs assemble.mjs builds from.
// Kept free of Node imports so the plugin's test runner can load it.

export function parseStory(html, builtInUi) {
  const meta = {}
  for (const [, name, content] of html.matchAll(/<meta name="code-story:([a-z-]+)" content="([^"]*)">/g)) meta[name] = unescape(content)
  if (!meta.head) return null

  const languages = meta.languages.split(',')
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? ''
  const title = {}
  for (const l of languages) {
    const spanText = h1.match(new RegExp(`<span data-lang="${l}">([\\s\\S]*?)</span>`))?.[1]
    title[l] = unescape(spanText ?? h1.replace(/<[^>]*>/g, ''))
  }
  const pageUi = JSON.parse(html.match(/<script type="application\/json" id="i18n">([\s\S]*?)<\/script>/)?.[1] ?? '{}')
  const ui = Object.fromEntries(Object.entries(pageUi).filter(([l]) => !builtInUi[l]))

  const main = html.slice(html.indexOf('<main>') + '<main>'.length, html.lastIndexOf('</main>'))
  const chapters = [...main.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((m) =>
    m[0]
      .replace(/<code class="cf">[\s\S]*?<\/code> <span class="st">[^<]*<\/span> /g, '')
      .replace(/(<span class="k" data-stat="[^"]+">)[^<]*<\/span>/g, '$1</span>')
      .replace(/ data-missing/g, ''),
  )

  const story = {
    base: meta.base,
    // Older pages carry no head-ref; leaving head unset keeps HEAD.
    head: meta['head-ref'],
    languages,
    title,
    pr: meta.pr ? Number(meta.pr) : null,
    stack: meta.stack ? meta.stack.split(',').map(Number) : [],
    branch: meta.branch,
    uncommitted: meta.uncommitted === 'true',
    ui,
  }
  return { meta, story, chapters }
}

function unescape(s) {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

// A table or code block followed by a paragraph that starts "Table 1." / "Listing 1." (or the Polish
// "Tabela", "Listing", "Rysunek") gets that paragraph as its caption, and every table becomes a
// keyboard-scrollable region named by its caption, so wide tables scroll on their own instead of the page.
// Written for Sätteri's hast visitor, the default Markdown processor since Astro 7.
const CAPTION = /^(Table|Tabela|Listing|Figure|Rysunek)\s+\d+\./

export default function captions() {
  return {
    name: 'captions',
    element: {
      filter: ['table', 'pre'],
      visit(node, ctx) {
        const parent = ctx.parent(node)
        let i = (ctx.indexOf(node) ?? -1) + 1
        while (parent?.children[i]?.type === 'text' && !parent.children[i].value.trim()) i++
        const next = parent?.children[i]
        let id
        if (next?.type === 'element' && next.tagName === 'p' && CAPTION.test(ctx.textContent(next).trim())) {
          ctx.data.captions = (ctx.data.captions ?? 0) + 1
          id = `caption-${ctx.data.captions}`
          ctx.setProperty(next, 'id', id)
          ctx.setProperty(next, 'className', ['caption', 'table-caption'])
        }
        if (node.tagName === 'table') {
          const name = id ? `aria-labelledby="${id}"` : 'aria-label="Table"'
          ctx.wrapNode(node, { raw: `<div class="table-wrap" role="region" tabindex="0" ${name}></div>` })
        }
      },
    },
  }
}

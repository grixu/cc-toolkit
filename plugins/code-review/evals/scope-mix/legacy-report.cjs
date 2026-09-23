const { createWriteStream } = require('node:fs')

function proc(rows, out) {
  const s = createWriteStream(out)
  s.write('id,title,slug,tags\n')
  for (const r of rows) {
    s.write([r.id, JSON.stringify(r.title), r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), r.tags.join(' ')].join(',') + '\n')
  }
  s.end()
}

module.exports = { proc }

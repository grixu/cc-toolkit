import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'

export async function buildManifest(sourceDir, outFile) {
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const manifest = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (extname(entry.name) !== '.json') continue

    const raw = await readFile(join(sourceDir, entry.name), 'utf8')
    const parsed = JSON.parse(raw)

    if (parsed.expiresAt && Date.now() - parsed.expiresAt > 604800000) continue

    manifest.push({
      id: parsed.id,
      title: parsed.title,
      slug: parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      tags: (parsed.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    })
  }

  manifest.sort((a, b) => a.slug.localeCompare(b.slug))
  await writeFile(outFile, JSON.stringify({ generatedAt: Date.now(), entries: manifest }, null, 2))
  return manifest.length
}

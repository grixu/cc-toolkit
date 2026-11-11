import { getCollection, type CollectionEntry } from 'astro:content'
import { ui, type Lang } from './i18n'
import { groupOrder } from './groups'
import { pluginPath } from './lifecycle'

export type SectionId = 'start' | 'lifecycle' | 'plugins' | 'changelog'

export const sections: { id: SectionId; path: string; prefix: string; label: Record<Lang, string> }[] = [
  { id: 'start', path: 'getting-started/introduction/', prefix: 'getting-started/', label: { en: 'Get started', pl: 'Pierwsze kroki' } },
  { id: 'lifecycle', path: 'lifecycle/', prefix: 'lifecycle/', label: { en: 'Lifecycle', pl: 'Cykl pracy' } },
  { id: 'plugins', path: 'plugins/', prefix: 'plugins/', label: { en: 'Plugins', pl: 'Pluginy' } },
  { id: 'changelog', path: 'changelog/', prefix: 'changelog/', label: { en: 'Changelog', pl: 'Zmiany' } },
]

export const sectionOf = (path: string) => sections.find((s) => path.startsWith(s.prefix))?.id
export const pluginOf = (path: string) => path.match(/^plugins\/([^/]+)\//)?.[1]

type TocItem = { depth: number; slug: string; text: string; children: TocItem[] }
const MIN_TOC_HEADINGS = 3
// Starlight lists the page title as the first depth-2 entry, slug `_top`.
export const tocHeadings = (toc?: { items: TocItem[] }) => {
  const items = (toc?.items ?? []).filter((i) => i.depth === 2 && i.slug !== '_top')
  return items.length >= MIN_TOC_HEADINGS ? items : []
}

type GroupKey = (typeof groupOrder)[number]
const groupLabels: Record<Lang, Record<GroupKey, string>> = {
  en: { ...ui.en.groups, cycle: 'The cycle', outside: 'Outside the cycle' },
  pl: { ...ui.pl.groups, cycle: 'Cykl', outside: 'Poza cyklem' },
}

export type NavPage = { path: string; label: string; group: string }
export type NavGroup = { key: GroupKey; label: string; pages: NavPage[] }

type Entry = CollectionEntry<'docs'>
const UNORDERED = Infinity
const entryPath = (e: Entry) => {
  const id = e.id.replace(/^pl\//, '').replace(/(^|\/)index$/, '')
  return id === '' ? '' : `${id}/`
}

let cache: Promise<Entry[]> | undefined
const all = () => (cache ??= getCollection('docs'))

/** The page in the reader's language when it exists, so labels follow the locale while the order follows English. */
async function localized(lang: Lang) {
  const entries = await all()
  const en = entries.filter((e) => !e.id.startsWith('pl/'))
  const pl = new Map(entries.filter((e) => e.id.startsWith('pl/')).map((e) => [entryPath(e), e]))
  return en.map((e) => ({ en: e, here: lang === 'pl' ? (pl.get(entryPath(e)) ?? e) : e, path: entryPath(e), translated: lang === 'en' || pl.has(entryPath(e)) }))
}

export async function sidebarFor(path: string, lang: Lang): Promise<{ label: string; groups: NavGroup[] } | null> {
  const section = sectionOf(path)
  const plugin = pluginOf(path)
  let prefix: string
  let label: string
  if (section === 'start') [prefix, label] = ['getting-started/', sections[0].label[lang]]
  else if (section === 'lifecycle') [prefix, label] = ['lifecycle/', sections[1].label[lang]]
  else if (section === 'plugins' && plugin) [prefix, label] = [pluginPath(plugin), `${plugin} docs`]
  else return null

  const orderOf = (p: { en: Entry }) => p.en.data.sidebar.order ?? UNORDERED
  const groupOf = (p: { en: Entry; path: string }) => p.en.data.group ?? (p.path === prefix ? 'start' : 'guides')
  const pages = (await localized(lang))
    .filter((p) => p.path.startsWith(prefix))
    .sort((a, b) => orderOf(a) - orderOf(b) || a.path.localeCompare(b.path))

  const groups: NavGroup[] = []
  for (const key of groupOrder) {
    const inGroup = pages.filter((p) => groupOf(p) === key)
    if (!inGroup.length) continue
    groups.push({
      key,
      label: groupLabels[lang][key],
      pages: inGroup.map((p) => ({ path: p.path, label: p.here.data.sidebar.label ?? p.here.data.title, group: groupLabels[lang][key] })),
    })
  }
  return { label, groups }
}

export async function pagination(path: string, lang: Lang) {
  const sb = await sidebarFor(path, lang)
  if (!sb) return { prev: undefined, next: undefined }
  const pages = sb.groups.flatMap((g) => g.pages)
  const i = pages.findIndex((p) => p.path === path)
  return { prev: i > 0 ? pages[i - 1] : undefined, next: i >= 0 ? pages[i + 1] : undefined }
}

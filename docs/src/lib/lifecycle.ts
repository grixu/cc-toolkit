import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Lang } from './i18n'

type Localized = Record<Lang, string>

const repo = resolve(process.cwd(), '..')
const readJson = (path: string) => {
  try {
    return JSON.parse(readFileSync(resolve(repo, path), 'utf8'))
  } catch {
    return {}
  }
}

export const marketplaceVersion: string = readJson('.claude-plugin/marketplace.json').version ?? ''
export const installMarketplace = '/plugin marketplace add grixu/cc-toolkit'
export const installPlugin = (name: string) => `/plugin install ${name}@cc-toolkit`

export type StageId = 'plan' | 'build' | 'self' | 'test' | 'human' | 'maintain'

export type Stage = { id: StageId; n: string; slug: string; title: Localized; blurb: Localized; phase?: Localized; outside?: boolean }

const reviewAndTest: Localized = { en: 'Review & test', pl: 'Review i testy' }

export const stages: Stage[] = [
  {
    id: 'plan', n: '01', slug: 'plan',
    title: { en: 'Plan', pl: 'Planowanie' },
    blurb: {
      en: 'Every decision made and checked against the code before any is written.',
      pl: 'Każda decyzja podjęta i zweryfikowana względem kodu, zanim powstanie choć linijka.',
    },
  },
  {
    id: 'build', n: '02', slug: 'build',
    title: { en: 'Build', pl: 'Budowa' },
    blurb: {
      en: 'The spec cut into tasks and built in parallel worktrees.',
      pl: 'Spec pocięty na zadania i zbudowany równolegle w osobnych worktree.',
    },
  },
  {
    id: 'self', n: '03a', slug: 'self-review', phase: reviewAndTest,
    title: { en: 'Self-review', pl: 'Self-review' },
    blurb: {
      en: 'The agent reviews its own branch before anyone else sees it.',
      pl: 'Agent przegląda własny branch, zanim zobaczy go ktokolwiek inny.',
    },
  },
  {
    id: 'test', n: '03b', slug: 'test', phase: reviewAndTest,
    title: { en: 'Test', pl: 'Testy' },
    blurb: {
      en: 'The running app checked against the spec, with evidence for each verdict.',
      pl: 'Działająca aplikacja sprawdzona ze specem, z dowodem za każdym werdyktem.',
    },
  },
  {
    id: 'human', n: '03c', slug: 'human-review', phase: reviewAndTest,
    title: { en: 'Human review', pl: 'Review człowieka' },
    blurb: {
      en: 'Proof it works, a pull request a person can read in one screen, checks kept green and comments answered.',
      pl: 'Dowód, że działa, pull request do przeczytania na jednym ekranie, zielone checki i odpowiedzi na komentarze.',
    },
  },
  {
    id: 'maintain', n: '—', slug: 'maintain', outside: true,
    title: { en: 'Maintain', pl: 'Utrzymanie' },
    blurb: {
      en: 'Outside the cycle: upgrades checked before they break you, and an agent that learns your rules.',
      pl: 'Poza cyklem: aktualizacje sprawdzone, zanim coś zepsują, i agent, który uczy się twoich zasad.',
    },
  },
]
export const cycle = stages.filter((s) => !s.outside)
export const phase = { title: reviewAndTest, from: cycle.findIndex((s) => s.phase), to: cycle.length }
export const stageById = Object.fromEntries(stages.map((s) => [s.id, s])) as Record<StageId, Stage>
export const stagePath = (id: StageId) => `lifecycle/${stageById[id].slug}/`

export type Skill = {
  id: string
  plugin: string
  cmd: string
  stage: StageId
  does: Localized
  /** Site path without locale, ending in a slash. */
  href: string
  /** Part of the main line on the map, rather than a branch or a supporting station. */
  main?: boolean
  calledBy?: string
  /** Runs on its own through hooks; there is no command to type. */
  auto?: boolean
  feature?: Localized
  label?: string
}

export const skills: Skill[] = [
  { id: 'grill-topic', plugin: 'fd3', cmd: '/fd3:grill-topic', stage: 'plan', href: 'plugins/fd3/grill-topic/',
    does: { en: 'Only the interview, to argue an idea through', pl: 'Sam wywiad, żeby przegadać pomysł' } },
  { id: 'build-spec', plugin: 'fd3', cmd: '/fd3:build-spec', stage: 'plan', href: 'plugins/fd3/build-spec/', main: true,
    does: { en: 'Interview you, then write and check a spec', pl: 'Wywiad, potem zapis i sprawdzenie specu' } },
  { id: 'split-to-tasks', plugin: 'fd3', cmd: '/fd3:split-to-tasks', stage: 'build', href: 'plugins/fd3/split-to-tasks/', main: true,
    does: { en: 'Cut the spec into tasks and branches', pl: 'Potnij spec na zadania i branche' } },
  { id: 'implement', plugin: 'fd3', cmd: '/fd3:implement', stage: 'build', href: 'plugins/fd3/implement/', main: true,
    does: { en: 'Build the tasks in parallel worktrees', pl: 'Zbuduj zadania równolegle w worktree' } },
  { id: 'start-cr', plugin: 'code-review', cmd: '/code-review:start-cr', stage: 'self', href: 'plugins/code-review/start-cr/', main: true,
    does: { en: 'Review the branch through every lens that applies, at once', pl: 'Przejrzyj branch naraz każdą soczewką, która pasuje' } },
  { id: 'tester', plugin: 'tester', cmd: '/tester:run', label: 'tester', stage: 'test', href: 'plugins/tester/run/', main: true,
    does: { en: 'Check the running app against the spec, with evidence', pl: 'Sprawdź działającą aplikację ze specem, z dowodami' } },
  { id: 'pr-proof', plugin: 'pr-proof', cmd: '/pr-proof:walkthrough-video', label: 'pr-proof', stage: 'human', href: 'plugins/pr-proof/walkthrough-video/', main: true,
    does: { en: 'Prove the change works before a reviewer opens it', pl: 'Udowodnij, że zmiana działa, zanim reviewer ją otworzy' } },
  { id: 'pr-open', plugin: 'dev-kit', cmd: '/dev-kit:pr-open', stage: 'human', href: 'plugins/dev-kit/pr-open/', main: true,
    feature: { en: 'risk label', pl: 'etykieta ryzyka' },
    does: { en: 'Open a pull request a reviewer can read in one screen', pl: 'Otwórz pull request do przeczytania na jednym ekranie' } },
  { id: 'pr-shepherd', plugin: 'dev-kit', cmd: '/dev-kit:pr-shepherd', stage: 'human', href: 'plugins/dev-kit/pr-shepherd/', main: true,
    does: { en: 'Answer review comments and keep CI green until checks pass and threads are settled', pl: 'Odpowiadaj na komentarze i trzymaj CI na zielono, aż checki przejdą, a wątki zostaną rozstrzygnięte' } },
  { id: 'ci-fix', plugin: 'dev-kit', cmd: '/dev-kit:ci-fix', stage: 'human', href: 'plugins/dev-kit/ci-fix/', calledBy: 'pr-shepherd',
    does: { en: 'Fix a red CI run at its root cause', pl: 'Napraw czerwone CI u źródła' } },
  { id: 'dep-upgrade-check', plugin: 'dev-kit', cmd: '/dev-kit:dep-upgrade-check', stage: 'maintain', href: 'plugins/dev-kit/dep-upgrade-check/',
    does: { en: 'Find out whether an upgrade will break you', pl: 'Sprawdź, czy aktualizacja coś zepsuje' } },

  { id: 'codex-review', plugin: 'codex-plan-improver', cmd: '/codex-plan-improver:codex-review', stage: 'plan', href: 'plugins/codex-plan-improver/',
    does: { en: 'A second opinion on the plan from Codex', pl: 'Druga opinia o planie od Codexa' } },
  { id: 'research', plugin: 'researcher', cmd: '/researcher:research', stage: 'plan', href: 'plugins/researcher/',
    does: { en: 'A cited report on an open question', pl: 'Raport ze źródłami na otwarte pytanie' } },
  { id: 'hookify', plugin: 'hookify', cmd: '/hookify:hookify', stage: 'maintain', href: 'plugins/hookify/hookify/',
    does: { en: 'A rule that stops a repeated mistake', pl: 'Reguła, która zatrzymuje powtarzany błąd' } },
  { id: 'rule-hooks', plugin: 'hookify', cmd: 'hooks', label: 'rule hooks', stage: 'build', href: 'plugins/hookify/', auto: true,
    does: { en: 'Warn or block an edit that breaks your rules, as the agent writes it', pl: 'Ostrzeż albo zablokuj edycję łamiącą twoje reguły, w chwili gdy agent ją pisze' } },
  { id: 'learn', plugin: 'session-learner', cmd: '/session-learner:learn', stage: 'maintain', href: 'plugins/session-learner/',
    does: { en: "Turn a session's corrections into rules", pl: 'Zamień poprawki z sesji w reguły' } },
]
export const skillById = Object.fromEntries(skills.map((s) => [s.id, s])) as Record<string, Skill>
export const shortName = (s: Skill) => s.label ?? s.cmd.split(':')[1] ?? s.cmd
/** The skill part of a command, for lists that already name the plugin. */
export const cmdName = (s: Skill) => s.cmd.split(':')[1] ?? shortName(s)

export type Plugin = { name: string; core: boolean; promise: Localized; desc: Localized; version: string; cmd: string }

const raw: Omit<Plugin, 'version' | 'cmd'>[] = [
  { name: 'fd3', core: true,
    promise: { en: 'Plan it, then build it', pl: 'Zaplanuj, potem zbuduj' },
    desc: {
      en: 'Interviews you until every decision is made, writes a spec it checks against your code, and builds the tasks in parallel worktrees.',
      pl: 'Wypytuje cię, aż każda decyzja zapadnie, pisze spec sprawdzony z twoim kodem i buduje zadania równolegle w worktree.',
    } },
  { name: 'code-review', core: true,
    promise: { en: 'The agent reviews itself', pl: 'Agent przegląda sam siebie' },
    desc: {
      en: 'Reviews a change through up to twelve lenses at once and merges them into one graded report, before anyone else reads it.',
      pl: 'Przegląda zmianę maksymalnie dwunastoma soczewkami naraz i scala je w jeden raport z ocenami, zanim przeczyta ją ktoś inny.',
    } },
  { name: 'tester', core: true,
    promise: { en: 'Does it work when it runs?', pl: 'Czy działa po uruchomieniu?' },
    desc: {
      en: 'Works out what to test from the spec or the diff, checks the running app, and records a command behind every verdict.',
      pl: 'Ustala ze specu albo diffu, co przetestować, sprawdza działającą aplikację i zapisuje komendę za każdym werdyktem.',
    } },
  { name: 'pr-proof', core: true,
    promise: { en: 'Proof for the reviewer', pl: 'Dowód dla reviewera' },
    desc: {
      en: 'Shows a reviewer the change works, on a recorded walkthrough attached to the pull request.',
      pl: 'Pokazuje reviewerowi, że zmiana działa, na nagranym walkthrough dołączonym do pull requesta.',
    } },
  { name: 'dev-kit', core: true,
    promise: { en: 'Pull requests, kept green', pl: 'Pull requesty na zielono' },
    desc: {
      en: 'Opens pull requests with a risk label, drives them through CI and review threads, and checks dependency upgrades.',
      pl: 'Otwiera pull requesty z etykietą ryzyka, prowadzi je przez CI i wątki review i sprawdza aktualizacje zależności.',
    } },
  { name: 'codex-plan-improver', core: false, promise: { en: '', pl: '' },
    desc: { en: "A second opinion on Claude's plans from OpenAI Codex.", pl: 'Druga opinia o planach Claude’a od OpenAI Codex.' } },
  { name: 'researcher', core: false, promise: { en: '', pl: '' },
    desc: { en: 'Answers a research question with a report where every claim cites a source.', pl: 'Odpowiada na pytanie badawcze raportem, w którym każde twierdzenie ma źródło.' } },
  { name: 'hookify', core: false, promise: { en: '', pl: '' },
    desc: { en: 'Stops Claude from repeating a mistake with a rule that warns or blocks.', pl: 'Powstrzymuje Claude’a przed powtarzaniem błędu regułą, która ostrzega albo blokuje.' } },
  { name: 'session-learner', core: false, promise: { en: '', pl: '' },
    desc: { en: 'Turns the corrections from a session into project rules.', pl: 'Zamienia poprawki z sesji w reguły projektu.' } },
]

export const plugins: Plugin[] = raw.map((p) => ({
  ...p,
  version: readJson(`plugins/${p.name}/.claude-plugin/plugin.json`).version ?? '',
  cmd: (skills.find((s) => s.plugin === p.name && s.main) ?? skills.find((s) => s.plugin === p.name))!.cmd,
}))
export const pluginByName = Object.fromEntries(plugins.map((p) => [p.name, p])) as Record<string, Plugin>
export const core = plugins.filter((p) => p.core)
export const supporting = plugins.filter((p) => !p.core)
export const skillsOf = (plugin: string) => skills.filter((s) => s.plugin === plugin)
export const stagesOf = (plugin: string) => stages.filter((st) => skillsOf(plugin).some((s) => s.stage === st.id))
export const lineStyle = (plugin: string) => (pluginByName[plugin]?.core ? `--pc: var(--line-${plugin})` : undefined)

export type Release = { plugin: string; version: string; date: string; kind: string; text: string }

export function releases(): Release[] {
  const out: Release[] = []
  for (const p of plugins) {
    let md = ''
    try {
      md = readFileSync(resolve(repo, 'plugins', p.name, 'CHANGELOG.md'), 'utf8')
    } catch {
      continue
    }
    const parts = md.split(/^## \[(\d[^\]]*)\] - (\d{4}-\d{2}-\d{2})\s*$/m)
    for (let i = 1; i < parts.length; i += 3) {
      const body = parts[i + 2] ?? ''
      const kind = body.match(/^### (\w+)/m)?.[1] ?? 'Changed'
      const bullet = body.match(/^- ([\s\S]*?)(?=\n- |\n###|\n## |$)/m)?.[1] ?? ''
      out.push({
        plugin: p.name,
        version: parts[i],
        date: parts[i + 1],
        kind,
        text: bullet.replace(/\s*\n\s*/g, ' ').replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim(),
      })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
export const badgeTone: Record<string, string> = { Added: 'success', Changed: 'info', Fixed: 'info', Removed: 'danger', Deprecated: 'warning', Security: 'danger' }

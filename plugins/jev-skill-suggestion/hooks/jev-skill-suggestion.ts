/**
 * jev-skill-suggestion — Claude Mod
 *
 * Takes the skill listing out of the context window and has TypeSafe's Jev,
 * a System One decision model, suggest at most one skill per prompt, going
 * by the skills' descriptions. The skills stay installed and loadable; what
 * goes away is the listing the engine sends the model every session, one
 * line per skill, whether the prompt has anything to do with any of them.
 *
 * The decision follows TypeSafe's "Skill suggestion" cookbook: two requests
 * per prompt, one to rank every skill and ask whether the prompt needs a
 * skill at all, one to re-read the top few with their full text and let each
 * be rejected on its own. Either may come back empty-handed.
 *
 * Three hooks do the work (session.end and session.compact only forget
 * which skills were injected):
 *   prompt.attachment  — the engine's `skill_listing` attachment is answered
 *                        with `{ text: null }` (left out) or trimmed to the
 *                        names in `alwaysListed`. Its names are remembered:
 *                        they are the engine's word on which skills the model
 *                        may invoke.
 *   prompt.submit      — the two requests run, and the winner (if any) is
 *                        attached to the prompt as a `<skill_relevance>`
 *                        block: with the skill's own SKILL.md inside it
 *                        (`inject: "content"`, the default), so the skill
 *                        loads even when `skillOverrides` hides it from the
 *                        model, or with its name for the Skill tool
 *                        (`inject: "suggest"`).
 *   skill.prompt       — observation: whether the model took the suggestion,
 *                        or loaded a skill on its own. Also writes the prompt
 *                        of the plugin's own `/jev-skill-suggestion:setup`,
 *                        which hides every skill from the engine's listing
 *                        (user-invocable-only) once the person has seen the
 *                        list and said yes; the model makes the edit with its
 *                        own tools, so it shows and asks like any other.
 *
 * The decision comes from whichever backend has a key: TypeSafe's Jev on its
 * own API (`typesafeApiKey`), Gemini Decision (`geminiApiKey`, model
 * gemini-decision-1), both of which report a confidence, or Jev on the Vercel
 * AI Gateway (`gatewayApiKey`), which does not. With none, the engine's own
 * `$.model.classify` stands in with a single request and no gate, so the mod
 * is useful without any account.
 *
 * The candidates come from `$.command.list()`, not from the listing: the
 * listing is only rendered at the turn's first request, after `prompt.submit`
 * has run, so the first prompt of a session would otherwise have nothing to
 * choose from. The listing, once seen, narrows the candidates to what the
 * engine itself would have shown.
 *
 * The second request reads the opening of each shortlisted skill's SKILL.md,
 * found on disk by how Claude Code lays skills out (project and user
 * `.claude/skills` and `.claude/commands`, a plugin's install path from
 * `~/.claude/plugins/installed_plugins.json`). A body that cannot be found
 * leaves that skill with its one-line description; nothing fails over it.
 *
 * Only the main conversation is handled. A subagent's own listing is left as
 * the engine renders it: its prompt is a tool call's argument, not a
 * `prompt.submit`, so nothing here could suggest for it.
 *
 * Every failure path is fail-open: a request that errors or runs past the
 * latency budget lets the prompt through with no suggestion, and the listing
 * hook always answers the same way, so the model's prompt cache holds.
 *
 * The API keys come from the plugin's options (userConfig "typesafeApiKey",
 * "geminiApiKey" or "gatewayApiKey"), else from TYPESAFE_API_KEY and
 * GEMINI_DECISIONS_API_KEY or GEMINI_API_KEY in the environment, so no key
 * has to travel on the command line. Never hardcode one in this file.
 *
 * Needs Claude Code >= 2.1.278: the
 * `prompt.attachment` event is that release's.
 *
 * Privacy: with a key set, the prompt text, every candidate skill's name and
 * description, and the opening of each shortlisted skill's SKILL.md are sent
 * to whichever backend the key belongs to.
 */
import type { Register } from 'claude-code'
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  NONE,
  SETUP_COMMAND,
  builtinWide,
  catalog,
  classifyText,
  commandLike,
  decide,
  describeRerank,
  describeSetup,
  describeStatus,
  describeStillListed,
  describeWide,
  detailOf,
  displayIds,
  canonical,
  endpoint,
  injectionBlock,
  installPathsOf,
  parseListing,
  parseNames,
  GEMINI_MAX_CHOICE,
  passesGate,
  pluginFileCandidates,
  ranksCatalog,
  readRerank,
  readSkillSettings,
  modelInvocable,
  readWide,
  rerankQuestions,
  requestBody,
  requestHeaders,
  restoreGeminiIds,
  selectProvider,
  setupAborted,
  setupInstructions,
  setupPlan,
  shortlistOf,
  validBackup,
  skillFileCandidates,
  suggestionBlock,
  syncedFileCandidates,
  trimListing,
  wideQuestions,
} from './policy.ts'
import type { Candidate, PolicyConfig, Provider, Rerank, Skill, Wide } from './policy.ts'
import { providerKeys } from './providers/index.ts'

/** Prompt origins that are not a task of the person's: nothing to suggest for. */
const NOT_A_TASK = new Set([
  'task-notification',
  'peer',
  'peer-send-message',
  'projects-relay',
  'observer',
  'observer-activity',
])

/** Display name → directory id for the skills under the project's and the user's `.claude/skills`. */
async function readDisplayIds($: {
  session: { cwd: () => Promise<string> }
  env: { get: (name: string) => Promise<string | undefined> }
  fs: {
    exists: (path: string) => Promise<boolean>
    read: (path: string) => Promise<string>
    list: (path: string) => Promise<readonly { name: string; kind: string }[]>
  }
}): Promise<Map<string, string>> {
  const found: { dir: string; markdown: string }[] = []
  for (const root of [await $.session.cwd(), (await $.env.get('HOME')) ?? '']) {
    const dir = root && `${root}/.claude/skills`
    if (!dir || !(await $.fs.exists(dir))) continue
    for (const entry of await $.fs.list(dir)) {
      const file = `${dir}/${entry.name}/SKILL.md`
      if (entry.kind === 'dir' && (await $.fs.exists(file))) found.push({ dir: entry.name, markdown: await $.fs.read(file) })
    }
  }
  return displayIds(found)
}

type SkillFile = { path: string; markdown: string }

type Backend = { provider: Provider; url: string; apiKey: string; modelId: string; timeoutMs: number }

/** One request to the backend, or null on timeout, error or a non-2xx. */
async function postDecision(
  $: {
    http: { fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text: string }> }
    clock: { sleep: (ms: number) => Promise<void> }
    ui: { log: (text: string) => void }
  },
  backend: Backend,
  prompt: string,
  questions: Record<string, unknown>,
  what: string,
): Promise<string | null> {
  const { provider, url, apiKey, modelId, timeoutMs } = backend
  try {
    const response = await Promise.race([
      $.http.fetch(url, {
        method: 'POST',
        headers: requestHeaders(provider, apiKey, modelId),
        body: requestBody(provider, prompt, questions, modelId),
      }),
      $.clock.sleep(timeoutMs),
    ])
    if (response && response.ok) return provider === 'gemini' ? restoreGeminiIds(response.text, questions) : response.text
    if (response) $.ui.log(`[jev-skill-suggestion] ${provider} responded ${response.status} to the ${what}`)
    else $.ui.log(`[jev-skill-suggestion] ${what} passed ${timeoutMs}ms; no suggestion`)
  } catch (error) {
    $.ui.log(`[jev-skill-suggestion] ${what} failed: ${String(error)}`)
  }
  return null
}

/** A skill's file, found on disk by Claude Code's layout, or null. */
async function findSkillFile(
  $: {
    env: { get: (name: string) => Promise<string | undefined> }
    fs: {
      exists: (path: string) => Promise<boolean>
      read: (path: string) => Promise<string>
      list: (path: string) => Promise<readonly { name: string; kind: string }[]>
    }
    ui: { log: (text: string) => void }
  },
  name: string,
  plugin: string | undefined,
): Promise<SkillFile | null> {
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const relative = skillFileCandidates(name, plugin)
    // The engine reads the project's `.claude/` (the working directory
    // only, not its ancestors) and the user's.
    const candidates = [...relative, ...(home ? relative.map((file) => `${home}/${file}`) : [])]
    if (plugin && home) {
      const installed = `${home}/.claude/plugins/installed_plugins.json`
      if (await $.fs.exists(installed)) {
        for (const path of installPathsOf(await $.fs.read(installed), plugin)) {
          candidates.push(...pluginFileCandidates(path, name, plugin))
        }
      }
    }
    // A claude.ai-synced skill sits under an account directory only
    // `$.fs.list` can name.
    if (home) {
      const synced = `${home}/.claude/skills/synced`
      if (await $.fs.exists(synced)) {
        const accounts = (await $.fs.list(synced)).filter((entry) => entry.kind === 'dir').map((entry) => entry.name)
        candidates.push(...syncedFileCandidates(home, accounts, name))
      }
    }
    for (const file of candidates) {
      if (await $.fs.exists(file)) return { path: file, markdown: await $.fs.read(file) }
    }
  } catch (error) {
    $.ui.log(`[jev-skill-suggestion] could not read /${name}: ${String(error)}`)
  }
  return null
}

export const register: Register = (on, options) => {
  const text = (key: string, fallback: string) =>
    typeof options[key] === 'string' && options[key] ? (options[key] as string) : fallback
  const number = (key: string, fallback: number) =>
    typeof options[key] === 'number' ? (options[key] as number) : fallback
  const flag = (key: string, fallback: boolean) =>
    typeof options[key] === 'boolean' ? (options[key] as boolean) : fallback

  // `provider` forces one backend, including "builtin" to use none; `auto`
  // takes TypeSafe, then Gemini, then the Gateway, whichever has a key.
  const forced = text('provider', 'auto')
  let active: Provider | null = null
  let apiKey = ''
  let modelId = ''
  let url = ''
  let unusableReported = true
  let resolved = false
  const keyOptions = { typesafe_api_key: text('typesafeApiKey', ''), gemini_api_key: text('geminiApiKey', '') }

  // The environment is only readable through `$`, so the backend is settled
  // when the first hook runs rather than at registration.
  const settleBackend = (keys: { typesafe: string; gemini: string }) => {
    resolved = true
    const gatewayKey = text('gatewayApiKey', '')
    active = selectProvider(forced, keys.typesafe, gatewayKey, keys.gemini)
    // Each backend keeps its own URL and model, so an override written for one
    // can never be sent to another when `auto` picks differently than expected.
    if (active === 'typesafe') {
      apiKey = keys.typesafe
      modelId = text('typesafeModel', DEFAULT_MODEL.typesafe)
      url = endpoint('typesafe', text('typesafeBaseUrl', DEFAULT_BASE_URL.typesafe))
    } else if (active === 'gemini') {
      apiKey = keys.gemini
      modelId = DEFAULT_MODEL.gemini
      url = endpoint('gemini', '')
    } else if (active === 'gateway') {
      apiKey = gatewayKey
      modelId = text('gatewayModel', DEFAULT_MODEL.gateway)
      url = endpoint('gateway', text('gatewayBaseUrl', DEFAULT_BASE_URL.gateway))
    }
    // A backend named in the options but missing its key degrades to the
    // built-in classifier, which is silent; say so once.
    unusableReported = forced === 'auto' || forced === 'builtin' || active !== null
  }

  const hideListing = flag('hideListing', true)
  // "content": the mod reads the chosen skill's SKILL.md and attaches it, so
  // the skill loads even when the engine lists it as user-invocable-only or
  // off. "suggest": the cookbook's block alone, and the model loads the skill
  // with the Skill tool, which honours the engine's skillOverrides.
  const injectContent = text('inject', 'content') !== 'suggest'
  const alwaysListed = parseNames(text('alwaysListed', ''))
  const neverSuggested = parseNames(text('neverSuggested', ''))
  const rerankEnabled = flag('rerank', true)
  const excerptChars = number('excerptChars', 700)
  const timeoutMs = number('timeoutMs', 800)
  const logDecisions = flag('logDecisions', true)
  const policy: PolicyConfig = {
    shortlist: Math.max(1, Math.round(number('shortlist', 3))),
    gateThreshold: number('gateThreshold', 0.3),
    fitsThreshold: number('fitsThreshold', 0.3),
  }

  // The names every skill_listing attachment carried so far. Under
  // `inject: "suggest"`, once non-empty, only these are offered to the
  // decision model: the listing is the engine's word on which skills the
  // model may invoke, and `$.command.list()` also names commands it may not.
  const listed = new Set<string>()
  // The skill suggested for the current prompt, so a skill.prompt that loads
  // it can be told apart from one the model reached for on its own.
  let suggested: string | null = null
  // Each skill's SKILL.md as first found, with where, or null when nowhere:
  // read once per worker, since the second request wants it on every prompt
  // it is on, and the injection wants it whole.
  const files = new Map<string, { path: string; markdown: string } | null>()
  // The skills whose instructions were already attached this session: a
  // second time, the block only names the skill again.
  const injected = new Set<string>()
  // Said once, the first time a hook runs. A mod that loaded and one that
  // never loaded are otherwise told apart only by the absence of later lines,
  // and absence is not evidence: with the listing gone, silence is the norm.
  let announced = false
  // The setup hint, once per worker: session.end does not reset it.
  let hintedSetup = false

  // A skill whose frontmatter `name:` has spaces ("PocketBase API Rules") is
  // reported by `$.command.list()` under that name, but the engine lists,
  // runs and overrides it by its directory name (`pb-api-rules`). The map
  // from one to the other is read from disk once per worker, in whichever
  // hook first needs it.
  let displayToId: Map<string, string> | null = null

  // Takes a loader and a logger rather than `$`, which the runtime will not
  // let through a call it cannot resolve statically.
  const ensureStarted = async (
    loadKeys: () => Promise<{ typesafe: string; gemini: string }>,
    log: (line: string) => void,
  ): Promise<void> => {
    if (!resolved) settleBackend(await loadKeys())
    if (announced) return
    announced = true
    if (logDecisions) log(`[jev-skill-suggestion] ${describeSetup(active, url, hideListing, forced === 'builtin')}`)
  }

  on('prompt.attachment', { type: 'skill_listing' }, async ($, e, next) => {
    await ensureStarted(() => providerKeys($, keyOptions), (line) => $.ui.log(line))

    const skills = parseListing(e.text)
    for (const skill of skills) listed.add(skill.name)

    // With the mod loading skills itself, a listing that still names any is
    // context the setup command would have saved: say so once.
    if (injectContent && !hintedSetup && skills.length > 0 && !e.agentId) {
      hintedSetup = true
      if (logDecisions) $.ui.log(`[jev-skill-suggestion] ${describeStillListed(skills.length)}`)
    }

    // A subagent's listing is not ours: nothing here suggests for a subagent,
    // so hiding its listing would leave it with no skills at all.
    if (!hideListing || e.agentId) return next(e)

    const kept = trimListing(e.text, alwaysListed)
    if (logDecisions) {
      const keptNames = kept
        ? parseListing(kept)
            .map((skill) => skill.name)
            .join(', ')
        : 'none'
      $.ui.log(
        `[jev-skill-suggestion] withheld the skill listing (${skills.length} skills, ${e.text.length} characters); kept listed: ${keptNames}`,
      )
    }
    // Answered without `next`: the engine's text never reaches the model.
    return { text: kept }
  })

  /** What one prompt's steps reach the engine through, with the prompt and each skill's plugin bound in. */
  type Io = {
    ask: (questions: Record<string, unknown>, what: string) => Promise<string | null>
    fileOf: (skill: Skill) => Promise<SkillFile | null>
    log: (line: string) => void
    now: () => Promise<number>
    classify: (text: string, labels: string[]) => Promise<string | undefined>
  }

  /** A skill's whole SKILL.md, or null when its file is nowhere. */
  const markdownOf = async (io: Io, skill: Skill): Promise<string | null> => (await io.fileOf(skill))?.markdown ?? null

  // Request 1: rank everything, and ask whether the prompt wants a skill at all.
  const rankCatalog = async (prompt: string, skills: Skill[], io: Io): Promise<Wide | null> => {
    const startedAt = await io.now()
    let wide: Wide | null = null
    const ranks = ranksCatalog(active, skills.length)
    if (active && !ranks && logDecisions) {
      io.log(`[jev-skill-suggestion] ${skills.length} skill(s) fall outside Gemini's 2-${GEMINI_MAX_CHOICE} options per choice; ranking with the built-in classifier`)
    }
    if (active && ranks) {
      const answer = await io.ask(wideQuestions(active, skills), 'ranking')
      if (answer) wide = readWide(answer)
    } else {
      // No backend: the engine's own small-model classifier answers the same
      // question, with the descriptions folded into the text it reads. One
      // label, no gate, no rerank.
      try {
        wide = builtinWide(await io.classify(classifyText(prompt, skills), [NONE, ...skills.map((skill) => skill.name)]))
      } catch (error) {
        io.log(`[jev-skill-suggestion] built-in classifier failed: ${String(error)}`)
      }
    }
    // What the decision model actually answered, whatever the policy then
    // does with it. This is the line that proves the ranking ran.
    if (logDecisions) io.log(`[jev-skill-suggestion] jev: ${describeWide(wide, skills.length, (await io.now()) - startedAt)}`)
    return wide
  }

  type Shortlist = { rerank: Rerank | null; attempted: boolean; barred: string[]; allBarred: boolean }

  // Request 2: re-read the shortlist with each skill's full text, and let
  // every candidate be rejected on its own.
  const rerankShortlist = async (wide: Wide | null, skills: Skill[], io: Io): Promise<Shortlist> => {
    const result: Shortlist = { rerank: null, attempted: false, barred: [], allBarred: false }
    if (!active || !rerankEnabled || !wide || !passesGate(wide, policy)) return result
    // `$.command.list()` may name a skill the model is not allowed to invoke
    // whenever the listing does not narrow the catalog; its own frontmatter tells.
    const candidates: Candidate[] = []
    for (const skill of shortlistOf(wide, skills, policy.shortlist)) {
      const body = await markdownOf(io, skill)
      if (!modelInvocable(body)) {
        result.barred.push(skill.name)
        continue
      }
      candidates.push({ ...skill, detail: detailOf(skill, body, excerptChars) })
    }
    result.allBarred = candidates.length === 0 && result.barred.length > 0
    if (candidates.length === 0) return result
    const startedAt = await io.now()
    result.attempted = true
    const answer = await io.ask(rerankQuestions(active, candidates), 'rerank')
    if (answer) result.rerank = readRerank(answer, candidates.length === 1 ? candidates[0]!.name : undefined)
    if (logDecisions) {
      const ms = (await io.now()) - startedAt
      const read = candidates.filter((candidate) => files.get(candidate.name)).length
      io.log(`[jev-skill-suggestion] jev: ${describeRerank(result.rerank, ms)} · ${read}/${candidates.length} bodies read`)
    }
    return result
  }

  // The policy's pick, unless its own frontmatter says the model may not invoke it.
  const vetoUninvocable = async (
    wide: Wide | null,
    skills: Skill[],
    shortlist: Shortlist,
    io: Io,
  ): Promise<{ pick: Skill | null; reason: string }> => {
    const barred = [...shortlist.barred]
    const offered = barred.length > 0 ? skills.filter((skill) => !barred.includes(skill.name)) : skills
    // Without this, decide would re-shortlist from the skills below the barred
    // ones and suggest one that never had its false-positive check.
    let decision = shortlist.allBarred
      ? { name: null, reason: 'every shortlisted skill has disable-model-invocation' }
      : decide(wide, shortlist.rerank, offered, policy, shortlist.attempted)
    let pick = decision.name ? (skills.find((skill) => skill.name === decision.name) ?? null) : null
    // The winner's own frontmatter has the last word, whichever path picked it.
    if (pick && !barred.includes(pick.name) && !modelInvocable(await markdownOf(io, pick))) {
      barred.push(pick.name)
      decision = { name: null, reason: `/${pick.name} has disable-model-invocation` }
      pick = null
    }
    if (logDecisions && barred.length > 0) {
      io.log(`[jev-skill-suggestion] not model-invocable, left out: ${barred.map((name) => `/${name}`).join(', ')}`)
    }
    return { pick, reason: decision.reason }
  }

  const buildBlock = async (pick: Skill | null, projectDir: () => Promise<string>, io: Io): Promise<string | null> => {
    if (!injectContent || !pick) return suggestionBlock(pick, hideListing)
    const file = await io.fileOf(pick)
    const block = injectionBlock(pick, file?.markdown ?? null, file?.path ?? null, await projectDir(), injected.has(pick.name))
    if (logDecisions) {
      io.log(
        file
          ? injected.has(pick.name)
            ? `[jev-skill-suggestion] /${pick.name} already injected this session; named again`
            : `[jev-skill-suggestion] injected /${pick.name} from ${file.path} (${file.markdown.length} characters)`
          : `[jev-skill-suggestion] no file found for /${pick.name}; suggested by name only`,
      )
    }
    if (file) injected.add(pick.name)
    return block
  }

  on('prompt.submit', async ($, e, next) => {
    await ensureStarted(() => providerKeys($, keyOptions), (line) => $.ui.log(line))
    suggested = null

    // Notifications and peer messages are not tasks; a typed `/name` already
    // names its skill. Neither gets a suggestion.
    if (!e.text.trim() || /^\/\S/.test(e.text.trim())) return next(e)
    if (e.origin && NOT_A_TASK.has(e.origin.kind)) return next(e)

    if (!unusableReported) {
      unusableReported = true
      $.ui.log(`[jev-skill-suggestion] provider "${forced}" has no key set; using the built-in classifier`)
    }

    let commands: Awaited<ReturnType<typeof $.command.list>>
    try {
      commands = await $.command.list()
      if (!displayToId && commands.some((command) => !commandLike(command.name))) displayToId = await readDisplayIds($)
      commands = canonical(commands, displayToId ?? new Map())
    } catch (error) {
      $.ui.log(`[jev-skill-suggestion] could not list the skills: ${String(error)}`)
      return next(e)
    }
    // Loading the skill itself, the mod is not bound to what the engine would
    // list: a skill hidden with skillOverrides is still a candidate.
    const skills = catalog(commands, injectContent ? new Set() : listed, neverSuggested)
    if (skills.length === 0) {
      if (logDecisions) $.ui.log('[jev-skill-suggestion] no candidate skills; nothing to suggest')
      return next(e)
    }
    const pluginOf = new Map(commands.map((command) => [command.name, command.plugin]))

    const io: Io = {
      ask: (questions, what) =>
        active
          ? postDecision($, { provider: active, url, apiKey, modelId, timeoutMs }, e.text, questions, what)
          : Promise.resolve(null),
      fileOf: async (skill) => {
        const cached = files.get(skill.name)
        if (cached !== undefined) return cached
        const found = await findSkillFile($, skill.name, pluginOf.get(skill.name))
        files.set(skill.name, found)
        return found
      },
      log: (line) => $.ui.log(line),
      now: () => $.clock.now(),
      classify: (text, labels) => $.model.classify(text, labels),
    }

    const wide = await rankCatalog(e.text, skills, io)
    const shortlist = await rerankShortlist(wide, skills, io)
    const { pick, reason } = await vetoUninvocable(wide, skills, shortlist, io)
    // A row in the transcript scrolls away; this line stays on screen.
    if (logDecisions) $.ui.status(describeStatus(pick?.name ?? null))
    if (logDecisions) {
      $.ui.log(pick ? `[jev-skill-suggestion] suggesting /${pick.name}: ${reason}` : `[jev-skill-suggestion] no suggestion: ${reason}`)
    }

    suggested = pick?.name ?? null
    const block = await buildBlock(pick, () => $.session.cwd(), io)
    if (!block) return next(e)
    // Attached on the way down: one block after the prompt as typed, read by
    // the model and never shown to the person.
    return next({ ...e, context: [...(e.context ?? []), block] })
  })

  // An injected skill lives in the conversation, not the process: `/clear`
  // or a resume starts another under the same worker, and a compaction may
  // summarize the block away. Either way the next pick goes in whole again.
  on('session.end', async ($, e, next) => {
    injected.clear()
    suggested = null
    return next(e)
  })
  on('session.compact', async ($, e, next) => {
    if (!e.agentId) injected.clear()
    return next(e)
  })

  on('skill.prompt', { skill: 'jev-skill-suggestion:setup' }, async ($, e, next) => {
    // The plugin's own setup command: its markdown is a placeholder, and the
    // prompt the model reads is written here, from the roster as the engine
    // has it and the user settings as they are. The model does the editing
    // with its own tools, so the change shows as a diff and asks permission.
    const mode = /\brestore\b/i.test(e.text) ? 'restore' : 'apply'
    // No plan from a partial roster or unreadable settings: the edit would
    // hide too little, and the backup would save the wrong values.
    let commands: Awaited<ReturnType<typeof $.command.list>> = []
    try {
      commands = await $.command.list()
      if (!displayToId && commands.some((command) => !commandLike(command.name))) displayToId = await readDisplayIds($)
      commands = canonical(commands, displayToId ?? new Map())
    } catch (error) {
      $.ui.log(`[jev-skill-suggestion] setup: could not list the skills: ${String(error)}`)
      return next({ ...e, text: setupAborted(`the skills could not be listed (${String(error)})`) })
    }
    const home = (await $.env.get('HOME')) ?? '~'
    const settingsPath = `${home}/.claude/settings.json`
    const backupPath = `${home}/.claude/jev-skill-suggestion.skill-overrides.backup.json`
    let json: string | null = null
    try {
      if (await $.fs.exists(settingsPath)) json = await $.fs.read(settingsPath)
    } catch (error) {
      $.ui.log(`[jev-skill-suggestion] setup: could not read ${settingsPath}: ${String(error)}`)
      return next({ ...e, text: setupAborted(`${settingsPath} exists but could not be read (${String(error)})`) })
    }
    const settings = readSkillSettings(json)
    const plan = setupPlan(commands, settings, new Set([SETUP_COMMAND]))
    // An earlier run's backup is reused only if it is one: a file that is
    // not this mod's, or is corrupt, is nothing restore could apply, so no
    // setup is built on top of it.
    let backupExists = false
    try {
      backupExists = await $.fs.exists(backupPath)
      if (backupExists && !validBackup(await $.fs.read(backupPath))) {
        $.ui.log(`[jev-skill-suggestion] setup: ${backupPath} is not a valid backup`)
        return next({
          ...e,
          text: setupAborted(
            `${backupPath} exists but is not a backup this mod wrote (expected {"skillOverrides": {...}, "disableBundledSkills": true|false|null}); ask the user to inspect it and move it away, or fix it, before running the setup again`,
          ),
        })
      }
    } catch (error) {
      $.ui.log(`[jev-skill-suggestion] setup: could not read ${backupPath}: ${String(error)}`)
      return next({ ...e, text: setupAborted(`${backupPath} could not be read (${String(error)})`) })
    }
    if (logDecisions) {
      $.ui.log(
        `[jev-skill-suggestion] setup (${mode}): ${plan.hide.length} to hide, ${plan.alreadyHidden.length} already hidden, ${plan.locked.length} locked by a plugin`,
      )
    }
    return next({ ...e, text: setupInstructions(mode, plan, settings, settingsPath, backupPath, backupExists) })
  })

  on('skill.prompt', async ($, e, next) => {
    // Observation only: whether the model took the suggestion, or reached for
    // a skill it was never told about, is the one measure of this mod's worth.
    if (logDecisions && e.skill !== SETUP_COMMAND) {
      const how =
        suggested === e.skill
          ? 'as suggested'
          : suggested
            ? `suggested was /${suggested}`
            : 'nothing was suggested'
      $.ui.log(`[jev-skill-suggestion] skill /${e.skill} loaded (${how})`)
    }
    return next(e)
  })
}

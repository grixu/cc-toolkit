import { effectivePalette, TIERS, type Backend, type PaletteConfig } from './config.ts'
import { ask, limiter, type DecisionProvider, type Question } from './decision.ts'
import type { Model, Palette } from './harness.ts'
import { chooseBackends, createProvider, hasAnyKey, providerKeys } from './providers/index.ts'

const FALLBACK_MODEL = 'haiku'

// `default` means neither was passed, so the harness uses its own configured default.
export type Source = 'caller' | 'decision' | 'default'

export type Choice = {
  model?: string
  effort?: string
  // `caller` when nothing was asked; otherwise the backend that answered, or `haiku`.
  chosenBy: string
  source: { model: Source; effort: Source }
}

export type ChoiceRequest = {
  palette: Palette // the harness's catalogue for one provider, before exclusions
  config: PaletteConfig
  backend: Backend
  model?: string
  effort?: string
  task: string
}

// One option the model question offers: a tier name with a mapping, otherwise the model id itself.
type Candidate = { key: string; model: Model }

export async function choose($, req: ChoiceRequest): Promise<Choice> {
  const given = req.model ? catalogueModel(req.palette, req.model) : undefined
  if (given && req.effort && !given.efforts.includes(req.effort)) {
    throw new Error(`${given.id} has no effort ${req.effort}; it supports ${given.efforts.join(', ')}`)
  }
  if (given && req.effort) return { model: given.id, effort: req.effort, chosenBy: 'caller', source: sources(req, 'decision') }

  const candidates = given ? [] : modelCandidates(req)
  try {
    const provider = await decisionProvider($, req.backend)
    if (provider) return await askBackend($, provider, req, given, candidates)
  } catch {
    // A configured backend without its key, or a failed or unusable answer, gets the same fallback as no key at all.
  }
  return askHaiku($, req, given, candidates)
}

function catalogueModel(palette: Palette, id: string): Model {
  const model = palette.models.find((m) => m.id === id)
  if (!model) throw new Error(`unknown model ${id}; the ${palette.provider} catalogue holds ${palette.models.map((m) => m.id).join(', ')}`)
  return model
}

function modelCandidates(req: ChoiceRequest): Candidate[] {
  const palette = effectivePalette(req.palette, req.config)
  const byId = new Map(palette.models.map((m) => [m.id, m]))
  const tiers = TIERS.flatMap((tier) => {
    const model = byId.get(req.config.tiers[tier] ?? '')
    return model ? [{ key: tier, model }] : []
  })
  const all = tiers.length ? tiers : palette.models.map((model) => ({ key: model.id, model }))
  const fitting = req.effort ? all.filter((c) => c.model.efforts.includes(req.effort!)) : all
  if (!fitting.length) {
    throw new Error(`no model in the ${req.palette.provider} palette${req.effort ? ` supports effort ${req.effort}` : ''}`)
  }
  return fitting
}

// Keys come from the environment only, and two keys under `auto` take TypeSafe rather than asking anyone.
async function decisionProvider($, backend: Backend): Promise<DecisionProvider | undefined> {
  const keys = await providerKeys($, undefined)
  if (!hasAnyKey(keys)) return undefined
  const chosen = chooseBackends({ decision_backend: backend }, undefined, keys, 'collegium')
  return createProvider(chosen === 'choose' ? 'typesafe' : chosen[0], keys, undefined)
}

function describe(model: Model): string {
  return `${model.id}; efforts ${model.efforts.join(', ')}; default effort ${model.defaultEffort}`
}

const MODEL_INSTRUCTIONS =
  'Pick the model that fits the task: the most capable for hard, open-ended or high-stakes work, a cheaper and faster one for small, well-defined work.'
const EFFORT_INSTRUCTIONS =
  'Pick the reasoning effort the task needs on this model: higher for hard, multi-step or ambiguous work, lower for small, mechanical work.'

async function askBackend($, provider: DecisionProvider, req: ChoiceRequest, given: Model | undefined, candidates: Candidate[]): Promise<Choice> {
  const limit = limiter(1)
  const pick = async (question: Question & { type: 'choice' }, input: Record<string, unknown>): Promise<string> => {
    const res = await ask($, provider, { input, questions: { choice: question } }, limit)
    const answer = res.answers.choice
    if (answer?.type !== 'choice' || !(answer.choice in question.options)) throw new Error('the backend answered outside the options')
    return answer.choice
  }
  let model = given
  if (!model) {
    const options = Object.fromEntries(candidates.map((c) => [c.key, describe(c.model)]))
    const key = await pick({ type: 'choice', instructions: MODEL_INSTRUCTIONS, options }, { task: req.task })
    model = candidates.find((c) => c.key === key)!.model
  }
  let effort = req.effort
  if (!effort) {
    const options = Object.fromEntries(model.efforts.map((e) => [e, e === model!.defaultEffort ? `${e} (the model's default)` : e]))
    effort = await pick({ type: 'choice', instructions: EFFORT_INSTRUCTIONS, options }, { task: req.task, model: model.id })
  }
  return { model: model.id, effort, chosenBy: provider.name, source: sources(req, 'decision') }
}

function sources(req: ChoiceRequest, missing: Source): Choice['source'] {
  return { model: req.model ? 'caller' : missing, effort: req.effort ? 'caller' : missing }
}

const HAIKU_SYSTEM =
  'You choose the model and reasoning effort for a coding agent run. Reply with only a JSON object {"model": "<id>", "effort": "<effort>"} using an id and an effort from the list given.'

// One call for both values; an answer outside the allowed set leaves what was missing to the harness's defaults.
async function askHaiku($, req: ChoiceRequest, given: Model | undefined, candidates: Candidate[]): Promise<Choice> {
  const allowed = given ? [given] : candidates.map((c) => c.model)
  const lines = allowed.map((m) => `- ${describe(m)}`)
  const prompt = [
    `Task:\n${req.task}`,
    given ? `The model is fixed: ${given.id}. Choose only the effort.` : 'Models:',
    ...lines,
    req.effort ? `The effort is fixed: ${req.effort}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const answer = await haikuAnswer($, prompt)
  const model = given ?? allowed.find((m) => m.id === answer?.model)
  const effort = req.effort ?? (model?.efforts.includes(answer?.effort as string) ? (answer!.effort as string) : undefined)
  if (!model || !effort) {
    return {
      ...(given ? { model: given.id } : {}),
      ...(req.effort ? { effort: req.effort } : {}),
      chosenBy: FALLBACK_MODEL,
      source: sources(req, 'default'),
    }
  }
  return { model: model.id, effort, chosenBy: FALLBACK_MODEL, source: sources(req, 'decision') }
}

async function haikuAnswer($, prompt: string): Promise<{ model?: unknown; effort?: unknown } | undefined> {
  try {
    const r = await $.model.complete({ model: FALLBACK_MODEL, system: HAIKU_SYSTEM, prompt, maxTokens: 200, timeoutMs: 60_000 })
    if (!r?.isAnswered) return undefined
    const json = String(r.text).match(/\{[\s\S]*\}/)
    const value = json ? JSON.parse(json[0]) : undefined
    return value && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}

export const meta = {
  name: 'researcher',
  description:
    'Source-grounded research: fan out firecrawl retrievers (WebSearch fallback) into cited findings, gate rounds on coverage + contradictions (Conflict-scout + deep-only Verifier feeding a single Assessor), synthesize once, edit for the audience, and render an evolving HTML report. Returns only the artifact path + a compact manifest.',
  phases: [
    { title: 'Setup', detail: 'load prior state.json (if extending), schemaVersion check, mmdc preflight' },
    { title: 'Plan', detail: 'derive distinct sub-query angles from the brief (diversity)' },
    { title: 'Research', detail: 'assessor-gated rounds: parallel retrievers → Conflict-scout → (deep) Verifier → Assessor' },
    { title: 'Synthesize', detail: 'one terminal Synthesizer reconciles findings into a cited, audience-neutral draft' },
    { title: 'Edit', detail: 'Editor re-cuts for concision + the brief audience tier; marks earn-their-place visuals' },
    { title: 'Compose', detail: 'Composer snapshots, copies assets, renders semantic HTML + diagrams/charts, writes state.json' },
  ],
}

// ───────────────────────────── args / brief ──────────────────────────────────
// AGENTS-NOTE: args sometimes arrives JSON-encoded as a string instead of an object; a naive typeof
// check then drops the whole payload and silently runs against defaults. Mirror multi-skill-review.js.
let a = {}
if (args && typeof args === 'object') a = args
else if (typeof args === 'string') { try { a = JSON.parse(args) } catch { a = {} } }

const SCHEMA_VERSION = 1 // bump when state.json shape changes; setup refuses a mismatched prior state

// slugify is a script-side fallback only — the skill normally resolves and passes `slug` (decision J).
const slugify = (s) => String(s || 'research')
  .toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
  .trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'research'

const brief = {
  goal: a.goal || (a.brief && a.brief.goal) || '',
  depth: ['quick', 'standard', 'deep'].includes(a.depth) ? a.depth : 'standard',
  recency: ['recent', 'any', 'latest'].includes(a.recency) ? a.recency : 'any',
  sources: ['broad', 'authoritative', 'technical-academic'].includes(a.sources) ? a.sources : 'broad',
  audience: {
    tier: ['lay', 'informed', 'practitioner', 'expert'].includes(a.audience && a.audience.tier)
      ? a.audience.tier : 'informed',
    descriptor: (a.audience && a.audience.descriptor) || '',
  },
  language: a.language || 'en', // the SKILL detects the question's language and passes it (decision K)
}

const OUTPUT_BASE = a.outputBase || './research'
const SLUG = a.slug || slugify(brief.goal)
const REPORT_DIR = `${OUTPUT_BASE}/${SLUG}`
const EXTENDING = !!a.extending
const PLUGIN_ROOT = a.pluginRoot || '' // ${CLAUDE_PLUGIN_ROOT}; the Composer copies assets/ from here

// Round budget per depth (ADR-0003: bounded by rounds, NOT a token budget). Fan-out cap is TUNABLE
// (PLAN §8 — settle during build); the probe ran 5 parallel retrievers comfortably.
const MAX_ROUNDS = ({ quick: 1, standard: 2, deep: 3 })[brief.depth]
const FANOUT = Number.isFinite(a.fanout) ? a.fanout : ({ quick: 3, standard: 5, deep: 6 })[brief.depth]
const RUN_VERIFIER = brief.depth === 'deep' // Verifier is depth-gated (ADR-0006)

if (!brief.goal) return { error: 'no-goal', message: 'args.goal (the research question) is required.' }

// ───────────────────────────── shared contracts (schemas) ────────────────────
// These are the INTERNAL structured contract every stage passes (PLAN §4). Heavy HTML never travels
// through them — only structured findings/answer. Trust tiers + typed evidence spans are first-class.

const TRUST_TIERS = ['primary', 'reputable-secondary', 'community'] // set by the Retriever at fetch
const EVIDENCE_KINDS = ['quote', 'image_region', 'locator'] // only `quote` is verbatim/string-checkable

// One retriever's raw output. The dedup step (script-side, deterministic) assigns the global
// append-only `source_id` and flattens findings — so retrievers do NOT invent global ids.
const RETRIEVER_SCHEMA = {
  type: 'object',
  required: ['sources'],
  properties: {
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['url', 'title', 'access_date', 'trust_tier', 'findings'],
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          access_date: { type: 'string', description: 'UTC date the source was fetched, YYYY-MM-DD (from `date -u`)' },
          trust_tier: { type: 'string', enum: TRUST_TIERS },
          candidate_image_urls: { type: 'array', items: { type: 'string' }, description: 'chart/infographic URLs worth considering for the report' },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              required: ['claim', 'evidence'],
              properties: {
                claim: { type: 'string', description: 'one discrete factual claim' },
                evidence: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['kind', 'value'],
                    properties: {
                      kind: { type: 'string', enum: EVIDENCE_KINDS },
                      value: { type: 'string', description: 'a `quote` is VERBATIM source text; `image_region` = url + alt/caption; `locator` = page/timestamp + paraphrase' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    notes: { type: 'string', description: 'optional: retrieval issues, e.g. "firecrawl unsupported on X, used WebSearch"' },
  },
}

// Persisted + in-flight research state. A finding here is the FLAT form (carries global source_ids[]).
const STATE_SCHEMA = {
  type: 'object',
  required: ['schemaVersion', 'sources', 'findings', 'roundCount'],
  properties: {
    schemaVersion: { type: 'integer' },
    brief: { type: 'object' },
    goal: { type: 'string' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source_id', 'url', 'title', 'trust_tier'],
        properties: {
          source_id: { type: 'integer' },
          url: { type: 'string' },
          title: { type: 'string' },
          access_date: { type: 'string' },
          trust_tier: { type: 'string', enum: TRUST_TIERS },
          candidate_image_urls: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'source_ids', 'evidence'],
        properties: {
          claim: { type: 'string' },
          source_ids: { type: 'array', items: { type: 'integer' } },
          evidence: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, value: { type: 'string' } } } },
        },
      },
    },
    answer: { type: ['string', 'null'] },
    roundCount: { type: 'integer' },
  },
}

// Setup agent return: prior state (when extending) + environment preflight.
const SETUP_SCHEMA = {
  type: 'object',
  required: ['schemaOk', 'extending', 'mmdcRunner', 'diagramsAvailable'],
  properties: {
    schemaOk: { type: 'boolean', description: 'false iff a prior state.json exists with a schemaVersion this workflow cannot read' },
    extending: { type: 'boolean', description: 'true iff a usable prior state.json was loaded' },
    priorSchemaVersion: { type: ['integer', 'null'] },
    mmdcRunner: { type: 'string', description: 'command prefix to compile .mmd → .svg: "mmdc", "pnpm dlx @mermaid-js/mermaid-cli", "npx -y @mermaid-js/mermaid-cli", or "" if none' },
    diagramsAvailable: { type: 'boolean', description: 'false ⇒ Composer renders without diagrams + a note (graceful degrade)' },
    state: { ...STATE_SCHEMA, type: ['object', 'null'] },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['subQueries'],
  properties: {
    interpretation: { type: 'string', description: 'one line: how you read the goal' },
    subQueries: {
      type: 'array',
      description: 'DISTINCT angles so parallel retrievers do not converge on the same hit',
      items: {
        type: 'object',
        required: ['angle', 'query'],
        properties: {
          angle: { type: 'string', description: 'what facet this covers (e.g. "official spec", "criticism", "benchmarks 2024+")' },
          query: { type: 'string', description: 'the search query string' },
        },
      },
    },
  },
}

const CONFLICT_SCHEMA = {
  type: 'object',
  required: ['conflicts'],
  properties: {
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'finding_ids', 'resolvable_hint'],
        properties: {
          description: { type: 'string', description: 'what contradicts what' },
          finding_ids: { type: 'array', items: { type: 'integer' } },
          source_ids: { type: 'array', items: { type: 'integer' } },
          resolvable_hint: { type: 'string', enum: ['likely', 'unlikely', 'unknown'], description: 'HINT only — materiality is the Assessor\'s call' },
        },
      },
    },
  },
}

const VERIFIER_SCHEMA = {
  type: 'object',
  required: ['refutations'],
  properties: {
    refutations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding_id', 'verdict', 'basis'],
        properties: {
          finding_id: { type: 'integer' },
          verdict: { type: 'string', enum: ['stands', 'refuted', 'needs-evidence'], description: 'refuted ⇒ drop; needs-evidence ⇒ becomes a gap; stands ⇒ keep' },
          basis: { type: 'string', description: 'reasoning over the gathered corpus — the Verifier does NOT fetch' },
        },
      },
    },
  },
}

const ASSESSOR_SCHEMA = {
  type: 'object',
  required: ['sufficient', 'gaps', 'followups'],
  properties: {
    sufficient: { type: 'boolean' },
    reasoning: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'unmet coverage + material/resolvable conflicts + unresolved refutations — drive the next round' },
    followups: { type: 'array', items: { type: 'string' }, description: 'ready-to-use follow-up questions for the human checkpoint' },
  },
}

// ───────────────────────────── helpers (deterministic, no agent) ─────────────
// Dedup retriever outputs by URL and assign GLOBAL append-only source ids, continuing from the prior
// run's max id (never renumber — ADR-0005/0006). Returns the merged {sources, findings} for the round.
function mergeRound(state, retrieverOutputs) {
  const byUrl = new Map(state.sources.map((s) => [s.url, s]))
  let nextId = state.sources.reduce((m, s) => Math.max(m, s.source_id), 0) + 1
  for (const out of retrieverOutputs) {
    if (!out || !Array.isArray(out.sources)) continue
    for (const src of out.sources) {
      if (!src || !src.url) continue
      let existing = byUrl.get(src.url)
      if (!existing) {
        existing = {
          source_id: nextId++,
          url: src.url,
          title: src.title || src.url,
          access_date: src.access_date || '',
          trust_tier: src.trust_tier || 'community',
          candidate_image_urls: Array.isArray(src.candidate_image_urls) ? src.candidate_image_urls : [],
        }
        byUrl.set(src.url, existing)
        state.sources.push(existing)
      } else if (Array.isArray(src.candidate_image_urls)) {
        for (const u of src.candidate_image_urls) if (!existing.candidate_image_urls.includes(u)) existing.candidate_image_urls.push(u)
      }
      for (const f of src.findings || []) {
        if (!f || !f.claim) continue
        state.findings.push({ claim: f.claim, source_ids: [existing.source_id], evidence: Array.isArray(f.evidence) ? f.evidence : [] })
      }
    }
  }
  return state
}

// Compact text view of accumulated findings/sources for prompts that reason over the corpus.
// Findings carry a #index so the Conflict-scout / Verifier / Assessor can reference them.
function corpusText(state) {
  const srcLine = (s) => `  [${s.source_id}] (${s.trust_tier}) ${s.title} — ${s.url}`
  const findLine = (f, i) => `  #${i} cites [${(f.source_ids || []).join('][')}]: ${f.claim}`
  return `SOURCES (${state.sources.length}):\n${state.sources.map(srcLine).join('\n')}\n\nFINDINGS (${state.findings.length}):\n${state.findings.map(findLine).join('\n')}`
}

// Synthesizer-only view: NO #index on findings (so the model never mistakes a finding's position for a
// citation) and an explicit list of the ONLY valid citation tokens — the SOURCE ids.
function synthCorpus(state) {
  const srcLine = (s) => `  [${s.source_id}] (${s.trust_tier}) ${s.title} — ${s.url}`
  const findLine = (f) => `  - ${f.claim}  (supported by ${(f.source_ids || []).map((i) => `[${i}]`).join('') || '[?]'})`
  const ids = state.sources.map((s) => s.source_id).join(', ')
  return `SOURCES — the ONLY valid citation ids are: ${ids}\n${state.sources.map(srcLine).join('\n')}\n\nEVIDENCE (cite the SOURCE id(s) shown after each item — never a finding's position):\n${state.findings.map(findLine).join('\n')}`
}

// ───────────────────────────── Setup ─────────────────────────────────────────
const setupPrompt = `
You are the SETUP step for a research-report workflow. Use Bash/Read only. Do NOT research anything.

Report directory: ${REPORT_DIR}
Extending an existing report: ${EXTENDING}
This workflow's state schemaVersion: ${SCHEMA_VERSION}

Do exactly this:
1. Ensure the directory exists: \`mkdir -p ${REPORT_DIR}/diagrams ${REPORT_DIR}/assets ${REPORT_DIR}/snapshots\`.
2. Prior state: if ${REPORT_DIR}/state.json exists, Read it.
   - If its schemaVersion !== ${SCHEMA_VERSION}: return schemaOk=false, extending=false, priorSchemaVersion=<it>, state=null (the orchestrator will refuse rather than corrupt an evolving report). Do not migrate.
   - Else return schemaOk=true, extending=true, priorSchemaVersion=<it>, and state = the FULL parsed object (schemaVersion, brief, goal, sources[], findings[], answer, roundCount).
   - If the file does not exist: schemaOk=true, extending=false, state=null.
3. mmdc preflight — pick the runner the Composer will use to compile Mermaid .mmd → .svg, in this order:
   - if \`command -v mmdc\` succeeds → mmdcRunner="mmdc", diagramsAvailable=true
   - else if \`command -v pnpm\` succeeds → mmdcRunner="pnpm dlx @mermaid-js/mermaid-cli", diagramsAvailable=true
   - else if \`command -v npx\` succeeds → mmdcRunner="npx -y @mermaid-js/mermaid-cli", diagramsAvailable=true
   - else → mmdcRunner="", diagramsAvailable=false
   Do NOT actually invoke npx/pnpm dlx (it would download a package) — only detect availability.
Return the structured object. Nothing else.`

phase('Setup')
const setup = await agent(setupPrompt, { label: 'setup', phase: 'Setup', schema: SETUP_SCHEMA })

if (setup && setup.schemaOk === false) {
  return {
    error: 'schema-mismatch',
    message: `Existing report at ${REPORT_DIR} has state schemaVersion ${setup.priorSchemaVersion}, but this workflow speaks v${SCHEMA_VERSION}. Refusing to corrupt it — start a fresh slug or migrate manually.`,
    artifactPath: REPORT_DIR,
  }
}

const isExtending = !!(setup && setup.extending && setup.state)
const mmdcRunner = (setup && setup.mmdcRunner) || ''
const diagramsAvailable = !!(setup && setup.diagramsAvailable)

// The accumulating research state (prior, when extending; else empty). Mutated in place by the loop.
const state = isExtending
  ? { ...setup.state, schemaVersion: SCHEMA_VERSION }
  : { schemaVersion: SCHEMA_VERSION, brief, goal: brief.goal, sources: [], findings: [], answer: null, roundCount: 0 }

log(`${isExtending ? `Extending (${state.sources.length} prior sources, round ${state.roundCount})` : 'Fresh report'} · depth=${brief.depth} maxRounds=${MAX_ROUNDS} fanout=${FANOUT} · diagrams=${diagramsAvailable ? mmdcRunner : 'OFF'}`)

// ───────────────────────────── Plan (distinct sub-queries) ───────────────────
const planPrompt = `
You plan the FIRST research round for this brief. Produce up to ${FANOUT} DISTINCT sub-query angles so that
parallel retrievers do not all converge on the same popular result (a known failure mode). Cover different
facets — official/spec sources, independent analysis, criticism/limitations, recent developments, data/benchmarks —
as fits the goal. Do NOT retrieve anything; only plan.

GOAL: ${brief.goal}
BRIEF: depth=${brief.depth}, recency=${brief.recency}, sourcePreference=${brief.sources}, language=${brief.language}
${isExtending ? `\nThis EXTENDS an existing report. Bias the angles toward GAPS and newer material, not what is already covered:\n${corpusText(state)}` : ''}

Recency guidance: recent ⇒ favour ~last 2 years; latest ⇒ fast-moving, prioritise newest; any ⇒ include foundational.
Source guidance: broad ⇒ all types (trust-weighted); authoritative ⇒ primary + reputable only; technical-academic ⇒ docs/standards/papers.
Return the structured object.`

phase('Plan')
const plan = await agent(planPrompt, { label: 'plan:sub-queries', phase: 'Plan', schema: PLAN_SCHEMA })
const subQueries = (plan && Array.isArray(plan.subQueries) && plan.subQueries.length)
  ? plan.subQueries.slice(0, FANOUT)
  : [{ angle: 'general', query: brief.goal }]
log(`Planned ${subQueries.length} sub-query angles: ${subQueries.map((q) => q.angle).join(', ')}`)

// ───────────────────────────── round-stage prompts ──────────────────────────
const RECENCY_HINT = {
  recent: 'favour material from roughly the last 2 years',
  latest: 'this is a fast-moving topic — prioritise the newest available material',
  any: 'include foundational/older material where it is authoritative',
}[brief.recency]
const SOURCE_HINT = {
  broad: 'all source types, weighted by trust',
  authoritative: 'primary + reputable-secondary only; skip community/forum sources',
  'technical-academic': 'documentation, standards, and peer-reviewed papers',
}[brief.sources]

const retrieverPrompt = (sq, round) => `
You are a RESEARCH RETRIEVER. Cover ONE angle of the goal: find real web sources, read the best ones, and
extract grounded findings. Do NOT synthesise or write prose — just gather and extract.

GOAL: ${brief.goal}
YOUR ANGLE: ${sq.angle}
STARTING QUERY (refine freely): ${sq.query}
Recency: ${RECENCY_HINT}. Sources: ${SOURCE_HINT}. Round ${round}.

Tools: FIRST load firecrawl — ToolSearch with query "select:firecrawl_search,firecrawl_scrape". Use firecrawl_search
to find candidate pages, then firecrawl_scrape to read the 2-4 most relevant. If firecrawl errors or a site is
unsupported (e.g. reddit.com — "site not supported"), FALL BACK to WebSearch (ToolSearch "select:WebSearch") and
work from its snippets. Record any fallback in \`notes\`.

For every source you actually used:
- url, title, and a trust_tier:
    "primary"            = official docs/specs/standards, or the primary actor's own statement;
    "reputable-secondary"= established press / well-known organisations;
    "community"          = forums, personal blogs, unverified posts.
- access_date: run \`date -u +%Y-%m-%d\` and use its output (workflow scripts cannot produce dates — you must).
- candidate_image_urls: URLs of charts/infographics on the page worth showing in a report (else []).
- findings: discrete factual claims, each with an evidence span:
    prefer kind="quote" — the EXACT verbatim text from the scrape (auditable by construction);
    kind="image_region" (value = url + alt/caption) for a chart/figure;
    kind="locator"     (value = page/section/timestamp + your paraphrase) for paywalled/non-text — explicitly non-verbatim.
Quality over volume — a handful of well-supported findings beats many thin ones. Never fabricate a quote.
Return the structured object.`

const conflictScoutPrompt = (st) => `
You are the CONFLICT-SCOUT. DETECT contradictions among the accumulated findings — claims that cannot both hold,
or that materially disagree. You do NOT judge materiality (that is the Assessor's job) and you do NOT fetch or
fact-check against the world — you only compare findings against EACH OTHER. Reference findings by their #index below.
For each conflict, HINT whether more retrieval could likely resolve it (likely / unlikely / unknown).

${corpusText(st)}

Return conflicts[] (empty array if the findings are mutually consistent).`

const verifierPrompt = (st) => `
You are the VERIFIER (this is a DEEP brief). Adversarially try to REFUTE the material findings, reasoning ONLY over
the gathered corpus — other findings, source trust tiers, internal logic. You do NOT fetch anything. Reference by #index.
For each finding you challenge, give a verdict:
  "refuted"        = the corpus shows it is wrong or unsupported → it will be DROPPED;
  "needs-evidence" = cannot be settled without fresh counter-evidence → becomes a GAP for another round;
  "stands"         = survives scrutiny.
Only list findings you actually challenge; anything unlisted is assumed to stand.

${corpusText(st)}

Return refutations[].`

const assessorPrompt = (st, conflicts, refutations, round) => `
You are the ASSESSOR — the loop's SINGLE gate. Decide whether another research round is warranted.

GOAL: ${brief.goal}
Planned facets: ${subQueries.map((q) => q.angle).join(', ')}
This is round ${round} of at most ${MAX_ROUNDS}. Depth intent: ${brief.depth} (a deep brief biases toward more rounds).

${corpusText(st)}

Conflicts detected this round:
${JSON.stringify(conflicts, null, 2)}
${RUN_VERIFIER ? `Verifier refutations this round:\n${JSON.stringify(refutations, null, 2)}` : '(no Verifier — quick/standard brief)'}

Judge each conflict's / refutation's MATERIALITY against the goal + planned facets. A material AND resolvable conflict,
or an unresolved (needs-evidence) refutation, is itself a gap. Green-light (sufficient=true) ONLY when coverage is
sufficient AND no material, resolvable conflict or refutation remains. Otherwise set sufficient=false and list gaps[]
that are SPECIFIC and retrievable (they become next round's retrievers). Always propose 2-4 ready-to-use followups[]
for the human checkpoint, even when sufficient.
Return the structured object.`

// ───────────────────────────── assessor-gated round loop ─────────────────────
phase('Research')
let assessment = null
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const queries = round === 1
    ? subQueries
    : ((assessment && assessment.gaps) || []).slice(0, FANOUT).map((g, i) => ({ angle: `gap-${i + 1}`, query: g }))
  if (!queries.length) { log(`Round ${round}: no gaps to chase — stopping`); break }

  log(`Round ${round}/${MAX_ROUNDS}: ${queries.length} parallel retrievers`)
  const outputs = await parallel(queries.map((sq) => () =>
    agent(retrieverPrompt(sq, round), { label: `retrieve:${sq.angle}`.slice(0, 38), phase: 'Research', schema: RETRIEVER_SCHEMA })))

  const before = state.findings.length
  mergeRound(state, outputs.filter(Boolean))
  state.roundCount++
  const newFindings = state.findings.length - before
  log(`Round ${round}: +${newFindings} findings (total ${state.findings.length}) from ${state.sources.length} sources`)

  // Conflict-scout — detection only, every round, after dedup.
  const scout = await agent(conflictScoutPrompt(state), { label: 'conflict-scout', phase: 'Research', schema: CONFLICT_SCHEMA })
  const conflicts = (scout && scout.conflicts) || []

  // Verifier — depth-gated; reasons over the corpus, drops refuted findings.
  let refutations = []
  if (RUN_VERIFIER) {
    const v = await agent(verifierPrompt(state), { label: 'verifier', phase: 'Research', schema: VERIFIER_SCHEMA })
    refutations = (v && v.refutations) || []
    const refutedIdx = refutations
      .filter((r) => r.verdict === 'refuted' && Number.isInteger(r.finding_id))
      .map((r) => r.finding_id)
      .sort((x, y) => y - x) // descending so earlier splices don't shift later indices
    for (const idx of refutedIdx) if (idx >= 0 && idx < state.findings.length) state.findings.splice(idx, 1)
    if (refutedIdx.length) log(`Round ${round}: Verifier dropped ${refutedIdx.length} refuted findings`)
  }

  // Assessor — the single gate.
  assessment = await agent(assessorPrompt(state, conflicts, refutations, round), { label: 'assessor', phase: 'Research', schema: ASSESSOR_SCHEMA })
  const sufficient = assessment ? assessment.sufficient : true
  log(`Round ${round}: Assessor ${sufficient ? 'GREEN — coverage sufficient' : `wants more (${((assessment && assessment.gaps) || []).length} gaps)`}`)
  if (sufficient) break
  if (newFindings === 0 && round > 1) { log('No new findings this round — stopping to avoid spinning'); break }
}

const gaps = (assessment && assessment.gaps) || []
const followups = (assessment && assessment.followups) || []

if (!state.findings.length) {
  return { error: 'no-findings', message: 'Retrieval produced no usable findings (firecrawl/WebSearch may be unavailable or the query too narrow).', artifactPath: REPORT_DIR, gaps, followups }
}

// ───────────────────────────── Synthesize + Edit ────────────────────────────
const SYNTH_SCHEMA = {
  type: 'object',
  required: ['title', 'answer'],
  properties: {
    title: { type: 'string', description: 'concise report title derived from the goal' },
    answer: { type: 'string', description: 'markdown with ## section headings and inline [id] citations; audience-NEUTRAL (full, faithful argument)' },
    residual_conflicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description'],
        properties: { description: { type: 'string' }, source_ids: { type: 'array', items: { type: 'integer' } } },
      },
    },
  },
}

const EDITOR_SCHEMA = {
  type: 'object',
  required: ['title', 'answer', 'sections', 'visuals'],
  properties: {
    title: { type: 'string' },
    answer: { type: 'string', description: 'edited markdown; each marked visual is a {{VISUAL:N}} token on its own line' },
    sections: { type: 'array', items: { type: 'string' }, description: 'final section heading titles in order (drives the ToC + manifest)' },
    visuals: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'intent', 'spec'],
        properties: {
          id: { type: 'integer', description: 'matches the {{VISUAL:N}} token in answer' },
          type: { type: 'string', enum: ['diagram', 'chart', 'table', 'image'] },
          intent: { type: 'string', description: 'why this visual earns its place' },
          spec: { type: 'string', description: 'WHAT to show: for diagram/chart/table the actual data/relationships (Composer authors the Mermaid/Chart.js/HTML); for image, the exact source image URL to download' },
          caption: { type: 'string' },
          source_ids: { type: 'array', items: { type: 'integer' }, description: 'provenance; REQUIRED for type=image (the source the image is attributed to)' },
        },
      },
    },
    open_questions: { type: 'array', items: { type: 'string' }, description: '0-4 questions worth flagging to the reader (curated from the assessor gaps)' },
    cut_summary: { type: 'string' },
  },
}

const TIER_GUIDE = {
  lay: 'LAY reader: define jargon inline, lead with intuition and concrete analogies, and cut expert-only nuance. Lean on more visuals.',
  informed: 'INFORMED reader: assume general literacy but DEFINE field-specific terms on first use.',
  practitioner: 'PRACTITIONER (in the field but junior): assume the basics, but still DEFINE advanced terms and EXPAND abbreviations on first use.',
  expert: 'EXPERT: assume the terminology including abbreviations, trim background, and foreground caveats and edge cases. Fewer visuals.',
}[brief.audience.tier]

const synthPrompt = `
You are the SYNTHESIZER — the reasoning core. You run ONCE, now that the Assessor has green-lit coverage. Read the FULL
findings + sources below and compose a single coherent, CITED draft answer to the goal.

GOAL: ${brief.goal}
Write the answer in this language: ${brief.language}.
${isExtending ? 'This EXTENDS an existing report — re-synthesise the WHOLE answer from ALL accumulated findings (holistic, per ADR-0005), not just new material. The findings are the source of truth.' : ''}

${synthCorpus(state)}

Rules:
- Reconcile findings where they can be reconciled. Where a contradiction is irreducible, SURFACE it with attribution
  (never hide it) and also list it in residual_conflicts.
- Every non-trivial claim cites its SOURCE id(s) inline as [id] or [id][id] (e.g. "throughput doubled [3][7]"). The ONLY
  valid citation tokens are the source ids listed above (1..${state.sources.length}). NEVER cite a finding's position or a
  number outside that set — a citation always points at a SOURCE. Reuse the [id]s shown beside each piece of evidence.
- Compose AUDIENCE-NEUTRAL: the full, faithful argument with all nuance and caveats. Do NOT trim for a reader — that is
  the Editor's job next.
- Structure with ## section headings; lead with a direct answer to the goal, then the support.
Return: title, answer (markdown with [id] citations), residual_conflicts[].`

// Compact inventory of source images the Editor may pull in — only when one is genuinely irreplaceable.
const candidateImages = state.sources
  .flatMap((s) => (s.candidate_image_urls || []).map((u) => ({ source_id: s.source_id, url: u })))
  .slice(0, 30)

const editPrompt = (synth) => `
You are the EDITOR — the SOLE audience-aware stage and an independent second pair of eyes. Re-cut the draft for concision
and for THIS reader; mark where a visual genuinely earns its place. Never flatten accuracy or drop a citation.

AUDIENCE: ${TIER_GUIDE}${brief.audience.descriptor ? ` Specifically: ${brief.audience.descriptor}.` : ''}
Keep the answer in this language: ${brief.language}.

DRAFT ANSWER:
${synth.answer}

Residual conflicts to keep visible (surface with attribution): ${JSON.stringify((synth && synth.residual_conflicts) || [])}
Assessor's open questions (curate + phrase for this reader): ${JSON.stringify(gaps)}
Source images available (mark type="image" ONLY if one is irreplaceable — otherwise RECONSTRUCT as a chart/diagram/table): ${JSON.stringify(candidateImages)}

Tasks:
1. Cut redundancy, filler and waffle hard; keep every cited claim and its [id] citations intact.${isExtending ? ' Treat the draft as a wholesale re-cut of the ENTIRE document, not an append.' : ''}
2. Adapt density and jargon to the audience above.
3. Mark visuals that genuinely help (more for a lay reader, fewer for an expert): put a placeholder token {{VISUAL:N}} on
   its OWN line where each belongs, and describe it in visuals[] — type, intent, spec, caption, source_ids. The Composer
   renders ONLY what you mark here. Prefer RECONSTRUCTING a visual from the findings (a "chart" for quantitative data, a
   "diagram" for flows/relationships, a "table" for structured comparisons) over pulling a source "image"; reserve "image"
   for a figure that genuinely cannot be reconstructed (always attribute it via source_ids).${diagramsAvailable ? '' : ' NOTE: Mermaid diagrams are UNAVAILABLE this run (no mmdc) — do NOT use type "diagram"; prefer "table" or "chart".'}
4. open_questions[]: 0-4 questions worth flagging to the reader (curated from the assessor's).
Return: title, answer (edited markdown with {{VISUAL:N}} tokens), sections[], visuals[], open_questions[], cut_summary.`

phase('Synthesize')
const synth = await agent(synthPrompt, { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA })
if (!synth || !synth.answer) {
  return { error: 'synthesis-failed', message: 'The Synthesizer produced no answer.', artifactPath: REPORT_DIR, gaps, followups }
}

phase('Edit')
const edited = await agent(editPrompt(synth), { label: 'edit', phase: 'Edit', schema: EDITOR_SCHEMA })
const doc = (edited && edited.answer)
  ? edited
  : { title: synth.title, answer: synth.answer, sections: [], visuals: [], open_questions: gaps.slice(0, 4), cut_summary: 'editor unavailable — rendered the synthesizer draft as-is' }
state.answer = doc.answer

// ───────────────────────────── Persist (snapshot + state.json) ──────────────
// Done BEFORE rendering and separately from it: state.json is the source of truth and must survive even if the
// large (occasionally flaky) HTML render drops mid-response. The prior report is snapshotted here too — once — so a
// compose retry never snapshots a same-run intermediate.
const PERSIST_SCHEMA = {
  type: 'object',
  required: ['stateWritten'],
  properties: { stateWritten: { type: 'boolean' }, snapshotMade: { type: 'boolean' } },
}
const persistPrompt = `
You are the PERSIST step. Using Bash/Write only, do TWO things under ${REPORT_DIR}, then return. Do NOT render HTML.
1. SNAPSHOT — only if a prior output.html exists (freeze it BEFORE the renderer overwrites it):
     cd ${REPORT_DIR}
     if [ -f output.html ]; then ts=$(date -u +%Y%m%dT%H%M%SZ); sed -e 's#="assets/#="../assets/#g' -e 's#="diagrams/#="../diagrams/#g' output.html > snapshots/output.$ts.html; fi
   Use this redirect form, NOT 'sed -i' (its syntax differs macOS vs Linux). The snapshot shares the LIVE ../assets/
   while its content stays frozen. Set snapshotMade true iff you wrote a snapshot.
2. STATE — write ${REPORT_DIR}/state.json containing EXACTLY this JSON, verbatim:
${JSON.stringify(state)}
Return { stateWritten, snapshotMade }.`

phase('Compose')
// state.json is the source of truth; retry hard (writes are cheap and idempotent) and ABORT before rendering if it
// cannot be persisted — keeping the prior consistent report beats rendering a v2 view over a v1 state.
let persisted = null
for (let attempt = 1; attempt <= 3 && !(persisted && persisted.stateWritten); attempt++) {
  if (attempt > 1) log(`Persist (state.json) attempt ${attempt} — retrying`)
  persisted = await agent(persistPrompt, { label: attempt > 1 ? `persist#${attempt}` : 'persist', phase: 'Compose', schema: PERSIST_SCHEMA })
}
if (!persisted || !persisted.stateWritten) {
  return { error: 'persist-failed', message: 'Could not write state.json after retries — aborted before render to keep the prior report and its state consistent. Re-run to retry.', artifactPath: `${REPORT_DIR}/output.html`, gaps, followups }
}

// ───────────────────────────── Compose (pure render, retryable) ─────────────
const COMPOSER_SCHEMA = {
  type: 'object',
  required: ['artifactPath', 'manifest'],
  properties: {
    artifactPath: { type: 'string', description: 'absolute or report-relative path to the written output.html' },
    manifest: {
      type: 'object',
      required: ['title', 'sections', 'sourceCount', 'roundCount'],
      properties: {
        title: { type: 'string' },
        sections: { type: 'array', items: { type: 'string' } },
        sourceCount: { type: 'integer' },
        roundCount: { type: 'integer' },
      },
    },
    snapshotMade: { type: 'boolean' },
    diagrams: { type: 'integer' },
    charts: { type: 'integer' },
    tables: { type: 'integer' },
    imagesFetched: { type: 'integer' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

const sourcesForRender = state.sources.map((s) => ({
  source_id: s.source_id, url: s.url, title: s.title, access_date: s.access_date, trust_tier: s.trust_tier,
}))
const hasChart = (doc.visuals || []).some((v) => v && v.type === 'chart')

const composerPrompt = `
You are the COMPOSER — the final stage. Render the editor-approved answer as the HTML Report at ${REPORT_DIR}/output.html,
plus its sidecar diagrams/ and assets/. Do ALL file I/O yourself (Bash / Write / curl); the verbose HTML must NOT be
returned — return only the compact manifest. You author NO CSS and NO bespoke <style>: the shipped report.css owns the
look; you emit semantic HTML against its fixed class vocabulary.

PATHS / CONFIG
- Report dir:      ${REPORT_DIR}   (diagrams/ assets/ snapshots/ already exist)
- Plugin assets:   ${PLUGIN_ROOT ? `${PLUGIN_ROOT}/assets` : "(unknown — locate via: find ~/.claude/plugins " + REPORT_DIR + "/../.. -path '*researcher/assets/report.css' 2>/dev/null | head -1)"}
- mmdc runner:     ${diagramsAvailable ? mmdcRunner : '(diagrams UNAVAILABLE — no mmdc; render that data as a table/chart + a note)'}
- Report language: ${brief.language}  — write all UI labels (ToC title, "Sources", "Open questions", "accessed", "Source") in THIS language.
- This run's round suffix for append-only artifact names: r${state.roundCount}

DOCUMENT DATA
TITLE: ${doc.title}
SECTIONS (in source order): ${JSON.stringify(doc.sections || [])}
ANSWER (markdown; contains {{VISUAL:N}} tokens and [id] citations) is between the markers:
<<<ANSWER
${doc.answer}
ANSWER>>>
VISUALS: ${JSON.stringify(doc.visuals || [])}
OPEN QUESTIONS: ${JSON.stringify(doc.open_questions || [])}
RESIDUAL CONFLICTS (surface with attribution): ${JSON.stringify((synth && synth.residual_conflicts) || [])}
SOURCES (render as the numbered list, ascending source_id): ${JSON.stringify(sourcesForRender)}

NOTE: the prior output.html has ALREADY been snapshotted and state.json ALREADY written by a separate PERSIST step.
Do NOT snapshot, and do NOT create or touch state.json here. Your job is purely to (re)render the live output.html
+ its assets/diagrams — this step is idempotent and may be retried, so never depend on prior partial output.

STEP 2 — ASSETS: copy report.css into the report every run; copy chart.umd.js ONLY if a chart is present (${hasChart ? 'YES — copy it' : 'no charts — skip it'}):
  cp "<pluginAssets>/report.css" ${REPORT_DIR}/assets/report.css
  ${hasChart ? `cp "<pluginAssets>/chart.umd.js" ${REPORT_DIR}/assets/chart.umd.js` : '(skip chart.umd.js)'}

STEP 3 — RENDER output.html. Skeleton (semantic HTML, fixed classes, NO <style>):
  <!DOCTYPE html><html lang="LANG"><head>   (LANG = the BCP-47 code for ${brief.language}, e.g. English→en, Polish→pl — a code, NOT the language name)
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TITLE</title>
    <link rel="stylesheet" href="assets/report.css">
    ${hasChart ? '<script src="assets/chart.umd.js"></script>' : '(no chart.umd.js)'}
  </head><body>
    <nav class="toc"><div class="toc-title">[localized: On this page]</div><ol>… one <li><a href="#sec-slug">Section title</a></li> per section, in order, ending with the Sources entry …</ol></nav>
    <main class="report">
      <header class="report-header"><h1>TITLE</h1></header>
      … ANSWER converted markdown→HTML …
      [if RESIDUAL CONFLICTS] <aside class="callout callout--conflict"><div class="callout-title">[localized: Unresolved contradictions]</div> …each with its [id] attributions… </aside>
      [if OPEN QUESTIONS] <aside class="callout callout--questions"><div class="callout-title">[localized: Open questions]</div><ul>…</ul></aside>
      <h2 id="sources">[localized: Sources]</h2>
      <ol class="sources">… one <li id="src-N"> per source …</ol>
    </main>
  </body></html>

  MARKDOWN→HTML rules for the ANSWER:
  - '## heading' → <h2 id="sec-slug">…</h2>; '### heading' → <h3 id="…">. Give every heading a slug id, list each in the
    ToC in source order (nav emitted FIRST), with the Sources <h2 id="sources"> as the final ToC entry.
  - Inline citation [n] → <a class="citation" href="#src-n">n</a> (emit JUST the number — report.css adds the [ ] brackets).
    [3][7] → two adjacent citation anchors. Cite ONLY ids present in SOURCES.
  - Ordinary markdown (paragraphs, **bold**, *italic*, lists, 'code', blockquotes, tables) → the matching semantic HTML.

  SOURCES list — one entry per source, ascending source_id:
    <li id="src-N"><span class="source-title">TITLE</span> <span class="source-trust" data-tier="DTIER">TIER</span><br>
      <a class="source-url" href="URL">URL</a> <span class="source-meta">· [localized: accessed] ACCESS_DATE</span></li>
    trust_tier → data-tier: primary→"primary", reputable-secondary→"secondary", community→"community".

STEP 4 — VISUALS: replace each '{{VISUAL:N}}' token line with rendered HTML per its visuals[] entry. Content artifacts are
  APPEND-ONLY — never overwrite a file in diagrams/ or assets/; make names unique with the round suffix (fig-r${state.roundCount}-N),
  so older snapshots keep resolving.
  - diagram (only if mmdc available): write Mermaid to diagrams/fig-r${state.roundCount}-N.mmd, then compile:
      ${diagramsAvailable ? `${mmdcRunner} -i diagrams/fig-r${state.roundCount}-N.mmd -o diagrams/fig-r${state.roundCount}-N.svg` : '(skip — no mmdc; render the data as a table instead + note it)'}
    embed: <figure class="figure diagram"><!-- source: diagrams/fig-r${state.roundCount}-N.mmd --><img src="diagrams/fig-r${state.roundCount}-N.svg" alt="CAPTION"><figcaption>CAPTION</figcaption></figure>
    If compilation fails, fall back to a <table> (or short note) so the data still shows — never abort.
  - chart: <figure class="figure"><div class="chart"><canvas id="chartN"></canvas>
      <script>new Chart(document.getElementById('chartN'), { /* compact readable data + options from spec */ });</script>
      <noscript><table>… the SAME numbers …</table></noscript></div><figcaption>CAPTION</figcaption></figure>
  - table: <figure class="figure"><table>…</table><figcaption>CAPTION</figcaption></figure>
  - image: download append-only into assets/img-r${state.roundCount}-N.<ext>:
      curl -fsSL --max-time 20 --retry 2 -o assets/img-r${state.roundCount}-N.<ext> "URL"
    On success: <figure class="figure"><img src="assets/img-r${state.roundCount}-N.<ext>" alt="CAPTION"><figcaption>CAPTION — [localized: Source] [src_id]</figcaption></figure>
    On failure (curl non-zero): SKIP the image, emit only a <figcaption> noting it was unavailable. Never abort.

Return ONLY the manifest (title, sections, sourceCount, roundCount), counts (diagrams/charts/tables/imagesFetched), and
any warnings. Do NOT return the HTML, and do NOT write state.json (the PERSIST step already did).`

// The Composer renders a large HTML in one response; a transient API drop can kill it. Retry once before giving up —
// state.json is already persisted, so even a hard failure leaves the DATA consistent (only the rendered view is stale).
let composed = null
for (let attempt = 1; attempt <= 2 && !(composed && composed.artifactPath); attempt++) {
  if (attempt > 1) log('Compose failed (transient?) — retrying once')
  composed = await agent(composerPrompt, { label: attempt > 1 ? 'compose#2' : 'compose', phase: 'Compose', schema: COMPOSER_SCHEMA })
}
if (!composed || !composed.artifactPath) {
  return {
    error: 'compose-failed',
    message: 'The Composer did not return an artifact path after a retry. state.json IS up to date — re-run to re-render output.html.',
    artifactPath: `${REPORT_DIR}/output.html`,
    statePersisted: !!(persisted && persisted.stateWritten),
    gaps,
    followups,
  }
}

return {
  artifactPath: composed.artifactPath,
  manifest: composed.manifest || { title: doc.title, sections: doc.sections || [], sourceCount: state.sources.length, roundCount: state.roundCount },
  snapshotMade: !!(persisted && persisted.snapshotMade),
  gaps,
  followups,
  warnings: composed.warnings || [],
}

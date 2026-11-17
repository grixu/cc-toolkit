import { expect, test } from 'claude-code/testing'
import { PREAMBLE, checkStrictSchema, envelopeSchema, prepareRun, substituteSkill } from '../hooks/prompt.ts'

function memoryFs(files: Record<string, string> = {}) {
  return {
    files,
    read: async (path: string) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`)
      return files[path]
    },
    write: async (path: string, text: string) => {
      files[path] = text
    },
  }
}

const strict = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line'],
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] } },
      },
    },
  },
}

test('a strict schema passes the check', () => {
  expect(checkStrictSchema(strict)).toBe(null)
})

test('the root must be an object schema', () => {
  expect(checkStrictSchema({ type: 'array', items: { type: 'string' } })).toContain('root')
  expect(checkStrictSchema('object')).toContain('root')
})

test('every object needs additionalProperties false, at any depth', () => {
  expect(checkStrictSchema({ ...strict, additionalProperties: true })).toContain('additionalProperties')
  const nested = structuredClone(strict)
  delete nested.properties.findings.items.additionalProperties
  expect(checkStrictSchema(nested)).toContain('result_schema.properties.findings.items')
})

test('every property must be required', () => {
  const broken = checkStrictSchema({ ...strict, required: ['verdict'] })
  expect(broken).toContain('every property must be required')
  expect(broken).toContain('findings')
})

test('allOf, not and if are rejected', () => {
  for (const key of ['allOf', 'not', 'if']) {
    const schema = structuredClone(strict)
    schema.properties.verdict[key] = key === 'allOf' ? [{ type: 'string' }] : { type: 'string' }
    expect(checkStrictSchema(schema)).toContain(`"${key}"`)
  }
})

test('the envelope slots the caller result schema in and keeps the rest fixed', () => {
  const plain = envelopeSchema()
  expect(plain.properties.result).toEqual({ type: ['string', 'null'] })
  expect(plain.required).toEqual(['status', 'summary', 'result', 'assumptions', 'open_questions'])
  expect(checkStrictSchema(plain)).toBe(null)
  expect(envelopeSchema(strict).properties.result).toEqual(strict)
})

test('skill text gets arguments, plugin root and skill dir substituted', () => {
  const text = 'Run $ARGUMENTS with ${CLAUDE_PLUGIN_ROOT}/scripts/x.sh and ${CLAUDE_SKILL_DIR}/ref.md; $ARGUMENTS again'
  expect(substituteSkill(text, 'the diff', '/p/code-review/skills/scan/SKILL.md')).toBe(
    'Run the diff with /p/code-review/scripts/x.sh and /p/code-review/skills/scan/ref.md; the diff again',
  )
})

test('arguments containing replacement patterns are inserted literally', () => {
  expect(substituteSkill('a $ARGUMENTS b', "$& $' $$", '/p/skills/s/SKILL.md')).toBe("a $& $' $$ b")
})

test('a skill outside a plugin layout uses its own folder as plugin root', () => {
  expect(substituteSkill('${CLAUDE_PLUGIN_ROOT}', '', '/home/me/notes/SKILL.md')).toBe('/home/me/notes')
})

test('a plain run writes the preamble, the task and the default envelope', async () => {
  const fs = memoryFs()
  const run = await prepareRun(fs, '/data/runs/r1', { task: 'Review the change.' })
  expect(run).toEqual({ promptPath: '/data/runs/r1/prompt.md', schemaPath: '/data/runs/r1/schema.json' })
  expect(fs.files['/data/runs/r1/prompt.md']).toBe(`${PREAMBLE}\n\nReview the change.\n`)
  expect(JSON.parse(fs.files['/data/runs/r1/schema.json'])).toEqual(envelopeSchema())
})

test('a caller result schema lands in schema.json', async () => {
  const fs = memoryFs()
  await prepareRun(fs, '/r', { task: 't', resultSchema: strict })
  expect(JSON.parse(fs.files['/r/schema.json']).properties.result).toEqual(strict)
})

test('a failing schema check is an error before anything is written', async () => {
  const fs = memoryFs()
  const run = await prepareRun(fs, '/r', { task: 't', resultSchema: { type: 'object', properties: { a: { type: 'string' } } } })
  expect(run.error).toContain('invalid result_schema')
  expect(run.error).toContain('additionalProperties')
  expect(Object.keys(fs.files)).toEqual([])
})

test('a skill run copies the substituted SKILL.md and points the task at the copy', async () => {
  const skill = '/plugins/cr/skills/scan/SKILL.md'
  const fs = memoryFs({ [skill]: 'Scan $ARGUMENTS using ${CLAUDE_SKILL_DIR}/rules.md' })
  await prepareRun(fs, '/r', { task: '--lens security', skill })
  expect(fs.files['/r/skill/SKILL.md']).toBe('Scan --lens security using /plugins/cr/skills/scan/rules.md')
  expect(fs.files[skill]).toBe('Scan $ARGUMENTS using ${CLAUDE_SKILL_DIR}/rules.md')
  const prompt = fs.files['/r/prompt.md']
  expect(prompt.startsWith(PREAMBLE)).toBe(true)
  expect(prompt).toContain('Read and follow /r/skill/SKILL.md')
  expect(prompt).toContain('--lens security')
})

test('an unreadable skill is an error', async () => {
  const run = await prepareRun(memoryFs(), '/r', { task: 't', skill: '/missing/SKILL.md' })
  expect(run.error).toContain('/missing/SKILL.md')
})

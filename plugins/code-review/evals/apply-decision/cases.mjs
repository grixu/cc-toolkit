// Turns the recorded decisions (local/decisions.code.jsonl and the run files beside it) into eval cases: the finding
// and review context applyDecisionRequest takes, and the owner's label.
import fs from 'node:fs'
import path from 'node:path'

// The types that are a fix the walk offered; follow-ups and open design choices have no finding behind them.
const FIX_TYPES = new Set(['walk', 'boy-scout'])

// A conventions note that says nothing applies only distracts the model.
const INERT_CONVENTIONS = /none that change|nothing there changes|changes? (?:a|the) verdict|nic z tego|no code conventions|covers only PR/i

function reviewOf(report) {
  const line = (re) => (String(report ?? '').match(re)?.[1] ?? '').trim() || null
  const conventions = line(/^\*\*Conventions:\*\*\s*(.+)$/m)
  return {
    scope: line(/^## Code review — (.+)$/m),
    conventions: conventions && !INERT_CONVENTIONS.test(conventions) ? conventions : null,
  }
}

// A report bullet states the problem, then the remedy after `→` or under a **Fix:** / **Naprawa:** label. The remedy
// is what the review would hand the walk, so it stands in for the fix the model judges in production.
export function splitBullet(bullet) {
  const text = String(bullet ?? '').trim()
  if (!text) return { problem: null, fix: null }
  const labelled = text.match(/^([\s\S]*?)\n?\s*-?\s*\*\*(?:Fix|Naprawa|Poprawka|Remedy):\*\*\s*([\s\S]+?)(?=\n\s*-\s*\*\*|$)/i)
  if (labelled) return { problem: text.replace(labelled[0].slice(labelled[1].length), '').trim(), fix: labelled[2].trim() }
  const arrow = text.lastIndexOf('→')
  if (arrow > 0) return { problem: text.slice(0, arrow).trim(), fix: text.slice(arrow + 1).trim() }
  return { problem: text, fix: null }
}

// proposal: 'bullet' takes the fix from the report bullet, as production would; 'walk' takes the walk's question text,
// which the owner answered but which is written only after the decision the model replaces.
export function loadCases(dataFile, { allTypes = false, proposal = 'bullet' } = {}) {
  const runsDir = path.join(path.dirname(dataFile), 'runs')
  const reports = new Map()
  const seen = new Map()
  const cases = []
  for (const line of fs.readFileSync(dataFile, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const d = JSON.parse(line)
    if (!allTypes && !FIX_TYPES.has(d.type)) continue
    if (!reports.has(d.run)) reports.set(d.run, reviewOf(JSON.parse(fs.readFileSync(path.join(runsDir, `${d.run}.json`), 'utf8')).report))
    const base = `${d.run}:${d.ask_id.slice(-8)}:${d.option ?? d.header}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const f = d.finding ?? {}
    const split = splitBullet(f.bullet)
    cases.push({
      id: n === 1 ? base : `${base}#${n}`,
      run: d.run,
      type: d.type,
      label: d.label,
      confidence: d.confidence,
      codeStatus: d.code?.status ?? 'none',
      finding: {
        severity: f.severity,
        family: f.family,
        rule: f.rule,
        path: d.code?.path ?? f.path,
        lines: f.lines,
        risk: 'structural',
        boyScout: d.type === 'boy-scout' || f.boy_scout === true,
        problem: proposal === 'walk' ? f.bullet : split.problem,
        fix: proposal === 'walk' ? d.proposal : split.fix,
        excerpt: d.code?.excerpt?.text ?? null,
        hunk: d.code?.hunk ?? null,
      },
      review: { ...reports.get(d.run), changedFiles: d.code?.changed_files ?? null },
    })
  }
  return cases
}

const DEFAULT_LEVELS = ['low', 'medium', 'high', 'critical']

const ratio = (n, total) => total ? n / total : null

export function wilson95(correct, total) {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || correct < 0 || total < correct)
    throw new RangeError('Wilson counts must be integers with 0 <= correct <= total')
  if (!total) return null
  const z = 1.959963984540054
  const p = correct / total
  const denominator = 1 + z * z / total
  const centre = (p + z * z / (2 * total)) / denominator
  const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
  return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) }
}

export function completionStatus(result, levels = DEFAULT_LEVELS) {
  if (result.error != null) return 'failed'
  if (!levels.includes(result.predicted) || result.complete === false || result.coverage?.partial === true) return 'incomplete'
  return 'completed'
}

const accuracy = (correct, total) => ({ correct, total, rate: ratio(correct, total), wilson95: wilson95(correct, total) })

export function summarizeMetrics(results, levels = DEFAULT_LEVELS) {
  const labelled = results.filter((r) => r.expected != null)
  for (const r of labelled)
    if (!levels.includes(r.expected)) throw new Error(`Unknown expected level ${JSON.stringify(r.expected)} for ${r.id}`)
  const answered = (r) => levels.includes(r.predicted)
  const complete = labelled.filter((r) => completionStatus(r, levels) === 'completed')
  const correct = complete.filter((r) => r.expected === r.predicted).length
  const countStatus = (rows, status) => rows.filter((r) => completionStatus(r, levels) === status).length
  const counts = (rows) => ({
    total: rows.length,
    answered: rows.filter(answered).length,
    completed: countStatus(rows, 'completed'),
    failed: countStatus(rows, 'failed'),
    incomplete: countStatus(rows, 'incomplete'),
  })
  const confusion = Object.fromEntries(levels.map((level) => [level,
    Object.fromEntries([...levels, 'failed', 'incomplete'].map((prediction) => [prediction, 0])),
  ]))
  for (const r of labelled) {
    const status = completionStatus(r, levels)
    confusion[r.expected][status === 'completed' ? r.predicted : status]++
  }
  const perClass = Object.fromEntries(levels.map((level) => {
    const support = labelled.filter((r) => r.expected === level).length
    const predicted = complete.filter((r) => r.predicted === level).length
    const tp = confusion[level][level]
    return [level, { support, predicted, tp, fp: predicted - tp, fn: support - tp,
      precision: ratio(tp, predicted), recall: ratio(tp, support) }]
  }))
  const dangerous = labelled.filter((r) => ['high', 'critical'].includes(r.expected) && ['low', 'medium'].includes(r.predicted))
  const highRisk = labelled.filter((r) => ['high', 'critical'].includes(r.expected)).length
  return {
    ...counts(results),
    labelled: counts(labelled),
    // A returned level can coexist with a failed policy call or a partial assessment.
    answeredDefinition: 'valid returned level, including failed or incomplete assessments',
    endToEndExactAccuracy: accuracy(correct, labelled.length),
    completeAssessmentAccuracy: accuracy(correct, complete.length),
    completeAssessmentCoverage: ratio(complete.length, labelled.length),
    confusion,
    perClass,
    dangerousUnderestimates: {
      count: dangerous.length,
      completed: dangerous.filter((r) => completionStatus(r, levels) === 'completed').length,
      highRiskLabelled: highRisk,
      rate: ratio(dangerous.length, highRisk),
      cases: dangerous.map((r) => ({ id: r.id, expected: r.expected, predicted: r.predicted, status: completionStatus(r, levels) })),
    },
  }
}

export function summarizeExperimental(results, version, signalKeys) {
  if (!version) return undefined
  const signals = { present: 0, absent: 0, unknown: 0, missing: 0 }
  let completed = 0
  let missingReports = 0
  for (const result of results) {
    const report = result.experimental
    if (report?.version !== version || !Array.isArray(report.signals) || !report.signals.length) {
      missingReports++
      continue
    }
    let missing = false
    for (const group of report.signals)
      for (const key of signalKeys) {
        const status = group.answers?.[key]?.status
        if (['present', 'absent', 'unknown'].includes(status)) signals[status]++
        else {
          signals.missing++
          missing = true
        }
      }
    if (report.status === 'complete' && !missing) completed++
  }
  return { version, requested: results.length, completed, incomplete: results.length - completed, missingReports, signals }
}

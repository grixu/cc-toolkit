// STALENESS scenario assertion. The fixture ships pre-drifted: exactly the API-1 element
// in spec.md was edited relative to the hashes recorded in feature.lock.json. /fd:grill
// should reconcile and mark EXACTLY the tasks that produce/consume API-1 as `stale`:
//   T-001 produces API-1        -> stale
//   T-002 consumes T-001::API-1 -> stale (propagated along the SC graph)
//   T-003 produces DB-1 only    -> untouched (must NOT be stale)
// The producer/consumer set is proven, not assumed: reset -> hasher shows only T-001/T-002
// input hashes move off their recorded baseline (see README).
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const EVALS_DIR = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.resolve(__dirname, '..', '..');

module.exports = async () => {
  const fail = (reason) => ({ pass: false, score: 0, reason });

  const featureDir = path.join(EVALS_DIR, '.sandbox', 'staleness', 'docs', 'features', 'notifications');
  const lockPath = path.join(featureDir, 'feature.lock.json');
  if (!fs.existsSync(lockPath)) return fail(`feature.lock.json missing (looked in ${lockPath})`);

  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (e) {
    return fail(`feature.lock.json does not parse: ${e.message}`);
  }

  const { loadAndValidate } = await import(pathToFileURL(path.join(PLUGIN_DIR, 'scripts', 'lib', 'validate.mjs')).href);
  const v = loadAndValidate(lockPath, path.join(PLUGIN_DIR, 'schemas', 'feature-lock.schema.json'));
  if (!v.valid) return fail(`feature.lock.json fails feature-lock.schema.json: ${JSON.stringify(v.errors)}`);

  const tasks = lock.tasks || {};
  const status = (id) => tasks[id] && tasks[id].status;
  const s1 = status('T-001');
  const s2 = status('T-002');
  const s3 = status('T-003');

  const problems = [];
  if (s1 !== 'stale') problems.push(`T-001 (produces API-1) should be "stale", got ${JSON.stringify(s1)}`);
  if (s2 !== 'stale') problems.push(`T-002 (consumes API-1) should be "stale", got ${JSON.stringify(s2)}`);
  if (s3 === 'stale') problems.push(`T-003 (independent, produces DB-1) must NOT be stale — staleness was not surgical`);
  if (s3 === undefined) problems.push('T-003 is missing from the manifest');

  if (problems.length) {
    return fail(`${problems.join('; ')} [statuses T-001=${s1}, T-002=${s2}, T-003=${s3}]`);
  }

  return {
    pass: true,
    score: 1,
    reason: `reconcile marked exactly the API-1 producer/consumer stale (T-001=${s1}, T-002=${s2}) and left the independent task alone (T-003=${s3}).`,
  };
};

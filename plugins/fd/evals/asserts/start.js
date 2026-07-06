// START scenario assertion. /fd:start <topic> ran in .sandbox/start/ and should have
// scaffolded docs/features/<slug>/ with a spec that has real ID-anchored elements, an
// initialised manifest, and a persisted DoR verdict.
//
// The slug is model-chosen, so the feature dir is discovered (glob), not hard-coded.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const EVALS_DIR = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.resolve(__dirname, '..', '..');

// Anchor grammar (hasher.mjs ANCHOR_RE): "### KIND-N — title", em dash U+2014, single-spaced.
const ANCHOR_RE = /^#{1,6} [A-Z]{2,10}-[1-9][0-9]* — /m;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

module.exports = async () => {
  const fail = (reason) => ({ pass: false, score: 0, reason });

  const featuresRoot = path.join(EVALS_DIR, '.sandbox', 'start', 'docs', 'features');
  if (!fs.existsSync(featuresRoot)) {
    return fail(`docs/features/ was not created (looked in ${featuresRoot}). ` +
      `Likely /fd:start did not run — check the plugin loaded (plugin path).`);
  }

  // Find the scaffolded feature dir (the one that has a spec.md).
  let featureDir = null;
  for (const d of fs.readdirSync(featuresRoot, { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(featuresRoot, d.name, 'spec.md'))) {
      featureDir = path.join(featuresRoot, d.name);
      break;
    }
  }
  if (!featureDir) return fail('no docs/features/<slug>/spec.md was created');

  const problems = [];

  // 1) spec.md has >= 1 valid anchor block.
  const spec = fs.readFileSync(path.join(featureDir, 'spec.md'), 'utf8');
  if (!ANCHOR_RE.test(spec)) {
    problems.push('spec.md has no valid ID-anchored element block ("### KIND-N — …" with an em dash)');
  }

  // 2) state.json: parses, phase === "spec", readiness.spec verdict in {ready, blocked}.
  let state;
  const statePath = path.join(featureDir, 'state.json');
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    return fail(`state.json missing/unparsable: ${e.message}`);
  }
  if (state.phase !== 'spec') problems.push(`state.phase should be "spec", got ${JSON.stringify(state.phase)}`);
  const specVerdict = state.readiness && state.readiness.spec && state.readiness.spec.verdict;
  if (specVerdict !== 'ready' && specVerdict !== 'blocked') {
    problems.push(`state.readiness.spec.verdict should be "ready" or "blocked", got ${JSON.stringify(specVerdict)}`);
  }

  // 3) feature.lock.json: parses, non-empty elements, spec.hash is a real sha256.
  let lock;
  const lockPath = path.join(featureDir, 'feature.lock.json');
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (e) {
    return fail(`feature.lock.json missing/unparsable: ${e.message}`);
  }
  if (!lock.elements || Object.keys(lock.elements).length === 0) {
    problems.push('feature.lock.json.elements is empty (spec produced no recorded elements)');
  }
  if (!lock.spec || !SHA256_RE.test(lock.spec.hash || '')) {
    problems.push(`feature.lock.json.spec.hash is not a sha256, got ${JSON.stringify(lock.spec && lock.spec.hash)}`);
  }

  // 4) schema validation via the plugin's own validator.
  const { loadAndValidate } = await import(pathToFileURL(path.join(PLUGIN_DIR, 'scripts', 'lib', 'validate.mjs')).href);
  for (const [file, schema] of [['state.json', 'state.schema.json'], ['feature.lock.json', 'feature-lock.schema.json']]) {
    const r = loadAndValidate(path.join(featureDir, file), path.join(PLUGIN_DIR, 'schemas', schema));
    if (!r.valid) problems.push(`${file} fails ${schema}: ${JSON.stringify(r.errors)}`);
  }

  if (problems.length) return fail(problems.join('; '));

  return {
    pass: true,
    score: 1,
    reason: `spec scaffolded at ${path.basename(featureDir)}/ with valid anchors, elements + spec.hash recorded, phase=spec, readiness.spec=${specVerdict}, all artifacts validate.`,
  };
};

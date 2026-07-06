// CONFIG scenario assertion. /fd:config ran in .sandbox/config/ and should have written a
// valid .claude/fd-config.json whose tooling reflects the fixture's pnpm scripts.
//
// Paths are resolved from __dirname (this file's location), NOT process.cwd() — promptfoo
// js assertions run in the promptfoo process and we must not assume its cwd. The artifact
// lives in the agent's working dir, which is the sandbox sibling of this asserts/ dir.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const EVALS_DIR = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.resolve(__dirname, '..', '..');

module.exports = async () => {
  const fail = (reason) => ({ pass: false, score: 0, reason });

  const configPath = path.join(EVALS_DIR, '.sandbox', 'config', '.claude', 'fd-config.json');
  const schemaPath = path.join(PLUGIN_DIR, 'schemas', 'fd-config.schema.json');
  const validatePath = path.join(PLUGIN_DIR, 'scripts', 'lib', 'validate.mjs');

  if (!fs.existsSync(configPath)) {
    return fail(`.claude/fd-config.json was not written (looked in ${configPath}). ` +
      `Likely the /fd:config command did not run — check the plugin loaded (plugin path).`);
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return fail(`fd-config.json does not parse as JSON: ${e.message}`);
  }

  if (cfg.schema !== 1) return fail(`schema must be 1, got ${JSON.stringify(cfg.schema)}`);

  const t = cfg.tooling || {};
  const problems = [];
  if (t.packageManager !== 'pnpm') {
    problems.push(`tooling.packageManager should be "pnpm" (fixture uses pnpm), got ${JSON.stringify(t.packageManager)}`);
  }
  // The fixture's package.json scripts are named build/lint/test/format and are invoked via
  // pnpm; accept either the "pnpm …" invocation or a value that names the script.
  for (const cmd of ['build', 'lint', 'test', 'format']) {
    const v = t[cmd];
    if (typeof v !== 'string' || !new RegExp(`pnpm|${cmd}`).test(v)) {
      problems.push(`tooling.${cmd} should reflect the fixture's "${cmd}" script, got ${JSON.stringify(v)}`);
    }
  }
  if (problems.length) return fail(problems.join('; '));

  const { loadAndValidate } = await import(pathToFileURL(validatePath).href);
  const r = loadAndValidate(configPath, schemaPath);
  if (!r.valid) return fail(`fd-config.json fails fd-config.schema.json: ${JSON.stringify(r.errors)}`);

  return {
    pass: true,
    score: 1,
    reason: 'fd-config.json written, parses, schema:1, tooling reflects the fixture pnpm scripts, and validates against the schema.',
  };
};

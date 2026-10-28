'use strict';

const { createRequire } = require('node:module');

async function launch() {
  const engine = createRequire(__filename)('@acme/pagekit-engine');
  return engine.launch({ headless: true });
}

module.exports = { launch };

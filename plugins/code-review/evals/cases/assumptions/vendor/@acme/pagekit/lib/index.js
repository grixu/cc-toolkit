'use strict';

const { launch } = require('./browser');
const { Session } = require('./session');

async function createSession() {
  return new Session(await launch());
}

module.exports = { createSession };

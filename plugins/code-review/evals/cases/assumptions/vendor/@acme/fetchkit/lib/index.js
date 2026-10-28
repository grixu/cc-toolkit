'use strict';

const { send } = require('./transport');
const { nextHop } = require('./redirect');
const { FetchkitError } = require('./errors');

const MAX_REDIRECTS = 10;

async function request(url, options = {}) {
  const redirect = options.redirect ?? 'follow';
  let current = {
    url: new URL(url),
    method: options.method ?? 'GET',
    headers: { ...(options.headers ?? {}) },
    body: options.body,
  };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await send(current, options.timeoutMs);
    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.location;
    if (!isRedirect || redirect === 'manual') return res;
    if (redirect === 'error') throw new FetchkitError('redirect', `redirected to ${res.headers.location}`);
    current = nextHop(current, res);
  }
  throw new FetchkitError('too-many-redirects', `more than ${MAX_REDIRECTS} redirects from ${url}`);
}

module.exports = { request, FetchkitError };

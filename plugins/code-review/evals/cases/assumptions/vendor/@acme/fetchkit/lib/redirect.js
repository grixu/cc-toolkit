'use strict';

const CROSS_ORIGIN_STRIPPED = ['authorization'];

function nextHop(previous, response) {
  const target = new URL(response.headers.location, previous.url);
  const headers = { ...previous.headers };

  if (target.origin !== previous.url.origin) {
    for (const name of Object.keys(headers)) {
      if (CROSS_ORIGIN_STRIPPED.includes(name.toLowerCase())) delete headers[name];
    }
  }

  const keepsBody = response.status === 307 || response.status === 308;
  return {
    url: target,
    method: keepsBody ? previous.method : 'GET',
    headers,
    body: keepsBody ? previous.body : undefined,
  };
}

module.exports = { nextHop };

'use strict';

const http = require('node:http');
const https = require('node:https');
const { FetchkitError } = require('./errors');

function send(req, timeoutMs) {
  const lib = req.url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const outgoing = lib.request(req.url, { method: req.method, headers: req.headers }, (incoming) => {
      clearTimeout(timer);
      const chunks = [];
      const body = new Promise((done, fail) => {
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
        incoming.on('error', fail);
      });
      resolve({
        status: incoming.statusCode,
        url: req.url.href,
        headers: incoming.headers,
        text: () => body,
        json: async () => JSON.parse(await body),
      });
    });
    const timer = timeoutMs
      ? setTimeout(() => {
          outgoing.destroy();
          reject(new FetchkitError('timeout', `no response headers from ${req.url.href} in ${timeoutMs} ms`));
        }, timeoutMs)
      : undefined;
    outgoing.on('error', reject);
    if (req.body !== undefined) outgoing.write(req.body);
    outgoing.end();
  });
}

module.exports = { send };

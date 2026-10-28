'use strict';

const { applyExtraHeaders, applyRequestHook } = require('./intercept');
const { runRules } = require('./rules');

class PagekitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PagekitError';
  }
}

class Session {
  constructor(browser) {
    this.browser = browser;
    this.closed = false;
  }

  async audit(url, options = {}) {
    if (this.closed) throw new PagekitError('session is closed');
    const page = await this.browser.newPage();
    try {
      if (options.headers) await applyExtraHeaders(page, options.headers);
      if (options.onRequest) await applyRequestHook(page, options.onRequest);
      await page.goto(url, { timeout: options.timeoutMs ?? 30_000, waitUntil: 'networkidle' });
      return { url, issues: await runRules(page) };
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.closed) throw new PagekitError('session already closed');
    this.closed = true;
    await this.browser.close();
  }
}

module.exports = { Session, PagekitError };

'use strict';

const CHECKS = [
  { code: 'img-alt', selector: 'img:not([alt])', message: 'Image has no alt text' },
  { code: 'button-name', selector: 'button:empty:not([aria-label])', message: 'Button has no accessible name' },
  { code: 'html-lang', selector: 'html:not([lang])', message: 'Document has no language' },
];

async function runRules(page) {
  const issues = [];
  for (const check of CHECKS) {
    const count = await page.$$eval(check.selector, (nodes) => nodes.length);
    if (count > 0) issues.push({ code: check.code, message: check.message, selector: check.selector });
  }
  return issues;
}

module.exports = { runRules };

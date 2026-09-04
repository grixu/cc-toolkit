import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  const blocks = (output.match(/Input Question:/g) || []).length;
  c.check(blocks === 1, `expected exactly one Input Question: block, found ${blocks}`);
  c.check(/Scope:/.test(output), 'no Scope: line');
  c.check(/General Answer:/.test(output), 'no General Answer: line');
  c.check(/Follow-up questions:/.test(output), 'no Follow-up questions: list');
  c.check(/Source:\s*(https?:\/\/|context7:)/.test(output), 'no Source: line with a URL or context7 id');
  c.check(!/Unanswered:/.test(output), 'an Unanswered: section is present (the question is answerable from promptfoo docs)');

  return c.verdict();
};

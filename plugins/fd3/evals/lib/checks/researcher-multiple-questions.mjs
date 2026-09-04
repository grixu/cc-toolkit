import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  const blocks = (output.match(/Input Question:/g) || []).length;
  c.check(blocks === 3, `expected exactly three Input Question: blocks, found ${blocks}`);

  // Caller's order and numbering preserved: BullMQ (1), workspace:* (2), JSON assertion (3)
  const i1 = output.search(/Input Question:[^\n]*BullMQ/i);
  const i2 = output.search(/Input Question:[^\n]*workspace/i);
  const i3 = output.search(/Input Question:[^\n]*JSON/i);
  c.check(i1 !== -1 && i2 !== -1 && i3 !== -1, 'a question is missing from the Input Question: headers');
  c.check(i1 !== -1 && i2 !== -1 && i3 !== -1 && i1 < i2 && i2 < i3, 'the blocks are not in the caller\'s order');
  c.check(/Input Question:\s*1\./.test(output) && /Input Question:\s*2\./.test(output) && /Input Question:\s*3\./.test(output), 'the caller\'s numbering was dropped');

  c.check((output.match(/Scope:/g) || []).length >= 3, 'fewer than three Scope: lines — blocks were collapsed');
  c.check((output.match(/General Answer:/g) || []).length >= 3, 'fewer than three General Answer: lines — blocks were collapsed');

  return c.verdict();
};

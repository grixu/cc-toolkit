import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  // Accept the round's numbering styles: "1.", "**1.", "### 1.", "Q1." / "**Q1."
  const numbered = output.match(/^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/gm) || [];
  c.check(numbered.length >= 2, `fewer than 2 numbered questions (${numbered.length})`);
  c.check(/recommend/i.test(output), 'no marked recommendation among the options');
  c.check((output.match(/^\s*[-*]\s+\*\*/gm) || []).length >= 2, 'no named options under the questions');

  return c.verdict();
};

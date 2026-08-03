import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(/grill|topic|plan|decision|idea/i.test(output), 'the output does not ask what to grill');
  const numbered = output.match(/^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/gm) || [];
  c.check(numbered.length < 2, `a numbered round started before any topic was given (${numbered.length} numbered items)`);

  return c.verdict();
};

import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(/Unanswered:/.test(output), 'no Unanswered: section — the undocumented question must land there, not be softened into an answer');
  const idx = output.indexOf('Unanswered:');
  if (idx !== -1) {
    const tail = output.slice(idx);
    c.check(/buffer/i.test(tail), 'the buffer-size question is not the one reported as Unanswered');
  }
  c.check(!/General Answer:[^\n]*\d+\s*(bytes|KiB|KB|kB)/i.test(output), 'a concrete byte value is asserted as the general answer despite no documented source');

  return c.verdict();
};

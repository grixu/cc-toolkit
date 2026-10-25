import * as h from '../helpers.mjs';

// getAuditResult in the fixture's src/store.ts, signature through closing brace.
const QUERY_LINES = [14, 27];

const READ_PATH = /store\.ts|getAuditResult/;
const THIRTY_DAY_READS =
  /\b(?:30|thirty) day (?:query |read |lookback |look back )?window\b|\blook(?:s|ing)? back (?:only )?(?:30|thirty) days\b|\b(?:reads?|queries|queried|lookups?)\b[^.]{0,40}\b(?:30|thirty) days\b/i;
const ATTRIBUTED = /\b(?:claims?|claimed|says|said|states|asserts)\b/i;
const DISPUTED = /\b(?:false|wrong|incorrect|untrue|misleading|contradict\w*)\b/i;
const DROP_EXPIRY =
  /\b(?:drop|remov|disabl|delet|unset|turn(?:ing)? off|switch(?:ing)? off|stop)\w*\b[^.]{0,60}\b(?:expir|ttl)\w*|\bno (?:partition )?expir\w*|\bnever expir\w*|\bkeep\b(?: \w+){0,4} (?:forever|indefinitely)\b|\bindefinite(?:ly)? (?:retention|retained|kept)\b/i;
// Links stay in inboxes for months, so a longer retention fixes them as surely as no expiry does.
const RAISE_RETENTION =
  /\b(?:rais|extend|increas|lengthen|bump)\w*\b[^.]{0,40}\b(?:retention|expir|ttl)\w*|\blonger (?:retention|expir\w*|ttl)\b/i;

// The comment in infra/results.tf claims reads only look back 30 days; the code reads by id within a
// day of the result's createdAt, at any age. A round that repeats the comment's claim without the
// read path beside it states a fact no lookup established.
// Reporting the comment's claim in order to dispute it is not repeating it as fact.
function attributed(prose, index) {
  const before = prose.slice(0, index);
  const clauseStart = Math.max(...['.', '!', '?', ';'].map((c) => before.lastIndexOf(c))) + 1;
  return ATTRIBUTED.test(before.slice(clauseStart));
}

export function claimFailures(output) {
  const out = [];
  const text = String(output || '');
  if (!/^\s*(?:[-*]\s+)?(?:#{1,4}\s+|\*\*)?Q?\d+[.)]/m.test(text)) out.push('the final message asks no numbered question: round 1 never went out');

  for (const block of text.split(/\n\s*\n/)) {
    const prose = h.normalizeProse(block);
    const disputed = DISPUTED.test(prose);
    const asserted = h.affirmedMatches(prose, THIRTY_DAY_READS).filter((m) => !(disputed && attributed(prose, m.index)));
    if (asserted.length && !READ_PATH.test(block)) {
      out.push(`the round asserts a 30-day read window that only the infra/results.tf comment claims, without the read path (src/store.ts): "${prose.trim().slice(0, 160)}"`);
    }
  }

  const whole = h.normalizeProse(text);
  if (h.affirmedMatches(whole, DROP_EXPIRY).length === 0 && h.affirmedMatches(whole, RAISE_RETENTION).length === 0) {
    out.push('no option or finding drops or raises the partition expiry, the fix the facts in the tree point to');
  }

  for (const m of text.matchAll(/store\.ts:L?(\d+)(?:\s*[-–]\s*L?(\d+))?/g)) {
    const from = Number(m[1]);
    const to = Number(m[2] || m[1]);
    if (to < QUERY_LINES[0] || from > QUERY_LINES[1]) out.push(`${m[0]} does not point at the read query (src/store.ts:${QUERY_LINES[0]}-${QUERY_LINES[1]})`);
  }
  return out;
}

export default (output) => {
  const c = h.checker();
  for (const failure of claimFailures(output)) c.check(false, failure);
  return c.verdict();
};

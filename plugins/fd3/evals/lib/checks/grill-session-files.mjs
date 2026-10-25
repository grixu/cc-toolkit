import path from 'node:path';
import * as h from '../helpers.mjs';

const SCENARIO = 'grill-session-files';
const LEDGER = /(^|\/)notes\/question-ledger\.md$/;
const PRIOR = /(^|\/)research\/prior-conversation\.md$/;

// No spec exists yet, so the grilling has nowhere in the repository to keep its files: the ledger
// and the prior-conversation record live in the session scratchpad, and the repository stays as the
// fixture left it. The prior-conversation record is owed only when something preceded the command,
// and this scenario's prompt is the bare command, so only its placement is graded.
export function sessionFileFailures(toolCalls, sandbox) {
  const out = [];
  const written = h.writtenPaths(toolCalls, sandbox);
  const inRepo = (p) => p === sandbox || p.startsWith(`${sandbox}${path.sep}`);
  for (const [re, name, required] of [
    [LEDGER, 'notes/question-ledger.md', true],
    [PRIOR, 'research/prior-conversation.md', false],
  ]) {
    const hits = written.filter((p) => re.test(p));
    if (hits.length === 0) {
      if (required) out.push(`no ${name} was written`);
    }
    else if (!hits.some((p) => !inRepo(p))) out.push(`${name} was written only inside the repository: ${hits.join(', ')}`);
  }
  const stray = written.filter(inRepo).map((p) => path.relative(sandbox, p));
  if (stray.length) out.push(`session files written inside the repository: ${stray.join(', ')}`);
  return out;
}

export default (output, context) => {
  const c = h.checker();

  const numbered = /^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/m.test(output);
  c.check(numbered || h.askedThroughTool(context), 'no round of questions — the grilling half never ran');

  const sandbox = h.sandboxDir(SCENARIO);
  for (const failure of sessionFileFailures(context?.providerResponse?.metadata?.toolCalls, sandbox)) c.check(false, failure);

  const diff = h.diffSandbox(SCENARIO, 'retry-topic');
  c.check(diff.added.length === 0, `files added to the repository: ${diff.added.join(', ')}`);
  c.check(diff.modified.length === 0, `fixture files modified: ${diff.modified.join(', ')}`);

  return c.verdict();
};

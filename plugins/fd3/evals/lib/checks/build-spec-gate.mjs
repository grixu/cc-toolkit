import * as h from '../helpers.mjs';

const NUMBERED = /^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/m;

export default (output, context) => {
  const c = h.checker();

  // A round may go out through AskUserQuestion and get auto-answered, leaving the final message
  // with no numbered question even though the grilling ran.
  const asked = (context?.providerResponse?.metadata?.toolCalls || [])
    .filter((call) => call.name === 'AskUserQuestion')
    .flatMap((call) => call.input?.questions || [])
    .some((q) => NUMBERED.test(q.question || ''));
  c.check(NUMBERED.test(output) || asked, 'no numbered round of questions — the grilling half never ran');

  // The gate: without a confirmed closing summary the write-spec half must not start.
  const diff = h.diffSandbox('build-spec-gate', 'retry-topic');
  // The grilling half legitimately writes notes and research reports; the gate is about the spec.
  // Research lands wherever the session scratchpad is, so match the directory, not a fixed path.
  const specFiles = diff.added.filter((f) => f.endsWith('.md') && !/(^|\/)(notes|research)\//.test(f));
  c.check(specFiles.length === 0, `a spec was written without a confirmed closing summary: ${specFiles.join(', ')}`);
  c.check(diff.modified.length === 0, `fixture files modified: ${diff.modified.join(', ')}`);

  return c.verdict();
};

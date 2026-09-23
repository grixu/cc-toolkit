import * as h from '../helpers.mjs';

const NUMBERED = /^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/m;

export default (output, context) => {
  const c = h.checker();

  // Numbering is grill-numbered-questions' concern; here the round only has to have gone out.
  c.check(NUMBERED.test(output) || h.askedThroughTool(context), 'no round of questions — the grilling half never ran');

  // The gate: without a confirmed closing summary the write-spec half must not start.
  const diff = h.diffSandbox('build-spec-gate', 'retry-topic');
  // The grilling half legitimately writes notes and research reports; the gate is about the spec.
  // Research lands wherever the session scratchpad is, so match the directory, not a fixed path.
  const specFiles = diff.added.filter((f) => f.endsWith('.md') && !/(^|\/)(notes|research)\//.test(f));
  c.check(specFiles.length === 0, `a spec was written without a confirmed closing summary: ${specFiles.join(', ')}`);
  c.check(diff.modified.length === 0, `fixture files modified: ${diff.modified.join(', ')}`);

  return c.verdict();
};

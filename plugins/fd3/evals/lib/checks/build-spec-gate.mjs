import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  const numbered = output.match(/^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/gm) || [];
  c.check(numbered.length >= 1, 'no numbered round of questions — the grilling half never ran');

  // The gate: without a confirmed closing summary the write-spec half must not start.
  const diff = h.diffSandbox('build-spec-gate', 'retry-topic');
  // The grilling half legitimately writes notes and research reports; the gate is about the spec.
  const specFiles = diff.added.filter((f) => f.endsWith('.md') && !/^(notes|research)\//.test(f));
  c.check(specFiles.length === 0, `a spec was written without a confirmed closing summary: ${specFiles.join(', ')}`);
  c.check(diff.modified.length === 0, `fixture files modified: ${diff.modified.join(', ')}`);

  return c.verdict();
};

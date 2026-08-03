export const ELEMENT_CODE = /\b(DB|API|CONFIG|OBSERVABILITY|UI|INTEGRATION|TEST|INFRA|DOCS|CICD)-\d+\b/;

const REQUIRED_HEADINGS = [
  [/design decisions/i, 'design decisions'],
  [/architecture/i, 'target architecture'],
  [/ownership/i, 'ownership'],
  [/rollout/i, 'rollout'],
  [/verification/i, 'verification'],
  [/out of scope/i, 'out of scope'],
  [/evidence|appendix/i, 'the evidence appendix'],
];

// Template-conformance asserts write-template-conformance and e2e-step1-write-spec share,
// applied to a produced spec file.
export function checkSpecShape(c, spec) {
  const heads = (spec.match(/^#{1,3}\s.*$/gm) || []);
  c.check(heads.filter((x) => /^##\s/.test(x)).length >= 10, `fewer than 10 ## sections (${heads.filter((x) => /^##\s/.test(x)).length})`);
  for (const [re, label] of REQUIRED_HEADINGS) {
    c.check(heads.some((x) => re.test(x)), `no heading for ${label}`);
  }
  c.check(/\|\s*D1\s*\|/.test(spec), 'no D1 row — the decision table is missing or unnumbered');
  c.check(ELEMENT_CODE.test(spec), 'no element code with a valid category prefix anywhere in the spec');
  const codes = [...new Set((spec.match(new RegExp(ELEMENT_CODE.source, 'g')) || []))];
  c.check(codes.some((code) => spec.split(code).length - 1 >= 2), 'no element code is cited outside its definition (work items must cite codes)');
  c.check(/\|\s*Claim\s*\|\s*How it was verified\s*\|/i.test(spec), 'no Claim|How it was verified evidence table');
}

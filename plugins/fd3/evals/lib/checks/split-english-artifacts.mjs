import * as h from '../helpers.mjs';
import * as s from './split-shared.mjs';

const POLISH_DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

export default () => {
  const c = h.checker();
  const tasks = h.readTasks('split-english-artifacts');

  // Language asserts only — files, never the chat text (the conversation may be Polish).
  c.check(tasks.length > 0, 'no task files were written');
  for (const t of tasks) {
    c.check(!POLISH_DIACRITICS.test(t.content), `${t.file}: contains Polish diacritics — task files must be English`);
    c.check(/## Goal/.test(t.body) && /## Done when/.test(t.body) && /## Where to look/.test(t.body), `${t.file}: headings are not the template's English ones`);
  }
  s.checkTaskStructure(c, tasks);
  s.checkCoverage(c, tasks);

  return c.verdict();
};

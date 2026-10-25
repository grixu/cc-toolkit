import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as h from '../helpers.mjs';

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const lines = (text) => text.split('\n').filter(Boolean);

// Files a `git status` reader would be asked to commit: untracked and not ignored, staged as new,
// or committed since the fixture baseline. `--no-renames` keeps a `git mv` of a tracked note
// visible as an addition at its new path.
export function visibleNewFiles(root) {
  const base = lines(git(root, ['rev-list', '--max-parents=0', 'HEAD']))[0];
  return [
    ...new Set([
      ...lines(git(root, ['ls-files', '--others', '--exclude-standard'])),
      ...lines(git(root, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=A'])),
      ...lines(git(root, ['diff', '--name-only', '--no-renames', '--diff-filter=A', base, 'HEAD'])),
    ]),
  ].sort();
}

export function ignored(root, rel) {
  try {
    git(root, ['check-ignore', '-q', rel]);
    return true;
  } catch {
    return false;
  }
}

// After write-spec the repository shows the spec and its evidence and nothing else; the session
// record sits in `<spec-basename>.session/`, every file of it ignored by git.
export function sessionFolderFailures(root, specRel) {
  const out = [];
  const specDir = path.posix.dirname(specRel);
  const folder = `${specRel.replace(/\.md$/, '')}.session`;
  const allowed = (f) => f === specRel || f.startsWith(`${specDir}/evidence/`);
  const visible = visibleNewFiles(root).filter((f) => !allowed(f));
  if (visible.length) out.push(`files git would offer to commit besides the spec and its evidence: ${visible.join(', ')}`);

  const abs = path.join(root, folder);
  if (!fs.existsSync(path.join(abs, 'notes.md'))) {
    out.push(`${folder}/notes.md does not exist: the closing notes never moved into the session folder`);
    return out;
  }
  const files = h.listFiles(abs).map((f) => `${folder}/${f}`);
  const tracked = files.filter((f) => !ignored(root, f));
  if (tracked.length) out.push(`session files git does not ignore: ${tracked.join(', ')}`);
  return out;
}

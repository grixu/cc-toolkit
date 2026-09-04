// Where recorded Claude Code sessions live, shared by asserts/run.js and replay.js — the two
// drifted once already, and a store added to one but not the other makes replay validate a
// different corpus than the matcher scores.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Resolved and deduplicated: the per-instance store paths are symlinks into the shared one, so
// taking them at face value finds a single session three times — harmless while callers only
// took the newest, and an instant false "3 concurrent runs" once they started counting.
function transcriptStores() {
  return [...new Set(
    [
      path.join(os.homedir(), '.claude', 'projects'),
      path.join(os.homedir(), '.ccs', 'instances', 'personal', 'projects'),
      path.join(os.homedir(), '.ccs', 'instances', 'work', 'projects'),
      path.join(os.homedir(), '.ccs', 'shared', 'context-groups', 'mg', 'projects'),
    ].map((p) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return p;
      }
    }),
  )];
}

// Claude Code names a project's store directory by flattening its cwd.
const encodeProjectDir = (projectPath) => projectPath.replace(/[^A-Za-z0-9]/g, '-');

// Every .jsonl transcript recorded for a project cwd, across all stores. Callers filter by
// content and timestamp themselves — binding a transcript to a particular run is their concern.
function transcriptFiles(projectPath) {
  const encoded = encodeProjectDir(projectPath);
  const files = [];
  for (const store of transcriptStores()) {
    const dir = path.join(store, encoded);
    let names;
    try {
      names = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of names) files.push(path.join(dir, f));
  }
  return files;
}

module.exports = { transcriptStores, encodeProjectDir, transcriptFiles };

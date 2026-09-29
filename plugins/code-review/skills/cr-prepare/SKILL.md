---
name: cr-prepare
description: >-
  Headless first step of a code review that another workflow drives — resolves the committed
  change against a base, reads the project's conventions and standards once, decides the active
  lens set, and writes all of it to a context directory that cr-scan and cr-merge read. Asks
  nothing and edits nothing in the checkout. Not for interactive use: a person reviews with
  /start-cr.
argument-hint: "--base <ref> --out <dir> [-C <checkout>] [--spec <path>]"
user-invocable: false
allowed-tools: Read, Bash, Grep, Glob, Write
---

# cr-prepare — settle what the review covers, once

Arguments: `$ARGUMENTS`

You do `/start-cr`'s Steps 1–2b for a caller that cannot answer questions: nobody reads a question
you ask, so every decision below is taken from the input or reported back, never put to anyone.

- `--base <ref>` — required. The ref the change is measured from; a commit SHA is fine.
- `--out <dir>` — required. The context directory; create it. It is the only place you write.
- `-C <checkout>` — the checkout under review. Defaults to the current directory.
- `--spec <path>` — optional. A spec the `spec` Lens reviews against.

A missing `--base` or `--out`, or a `-C` that is not a git checkout, ends the run with
`status: error` and the reason. Guess nothing.

## 1. Resolve the scope

The review covers what the checkout's commits changed since the base — never its uncommitted
work, which belongs to whoever has the checkout open:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/get_changes.py -C <checkout> --scope committed --base <ref>
```

A `count` of zero is never a clean review. With an `alternate` in the output, return
`status: empty` and name the alternate ref and its count; without one, return `status: empty`
alone. The caller decides what an empty change means — you do not call it "nothing to review".

Apply `${CLAUDE_PLUGIN_ROOT}/references/scope.md` to the list: which files are judged, which are
skipped and why, and each judged file's kind (`source`, `test`, `iac`) from its `## File kinds`
section.

`--spec` counts only when it names a readable local file. Anything else — a URL, a ticket id, a
path that does not open — leaves the `spec` Lens inactive with that reason; never substitute a file
you think was meant.

## 2. Conventions, standards, lens set

Settle the conventions note, the standards slot and the active lens set by
`${CLAUDE_PLUGIN_ROOT}/references/review-setup.md`, working the mechanical read `scope.md`
describes inside the checkout. A lens is named by its rules file's basename: `comments`,
`readability-tests`, `naming-module`, `objects-patterns`, `simplicity-types`, `security`,
`performance`, `spec`.

## 3. Write the context directory

Write each file with the `Write` tool:

- `conventions.md` — the note exactly as every Scanner will receive it. One text for all lenses.
- `standards.md` — the standards text, or one `## <lens>` section per lens when you pre-sliced it;
  the single word `none` when the root has neither file.
- `scope.json`:

```json
{
  "checkout": "<absolute path>",
  "base": "<the base the script resolved>",
  "diff_args": ["<from the script>"],
  "files": [{ "path": "src/a.ts", "status": "M", "kind": "source", "untracked": false }],
  "skipped": [{ "path": "pnpm-lock.yaml", "reason": "lockfile" }],
  "spec": "<absolute path, or null>",
  "lenses": {
    "active": [{ "lens": "performance", "files": ["src/a.ts"] }],
    "inactive": [{ "lens": "spec", "reason": "no spec named" }]
  }
}
```

`files` holds the judged files only. Every lens appears once, active or inactive; an active lens's
`files` is its own list — the `source` subset for `performance`, the whole judged list for every
other lens. On `status: empty`, write `scope.json` with empty lists and the `alternate` object
the script returned, so the caller can read what you saw.

## 4. Return

End this skill with this block and nothing after it. The block closes this skill, not the turn: when the prompt that invoked it names further steps, carry them out after it.

```
status: ready | empty | error
context: <dir>
base: <resolved base> · diff_args: <…>
files: <N> judged · <S> skipped
active: <lens, lens, …>
inactive: <lens — reason; …>
```

On `empty`, add `alternate: <ref> — <count> files`; on `error`, `reason: <what stopped you>`.

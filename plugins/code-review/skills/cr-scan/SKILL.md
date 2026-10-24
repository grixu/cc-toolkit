---
name: cr-scan
description: >-
  Headless code-review Scanner for one lens, or a listed few in turn — reads the context
  directory cr-prepare wrote, judges the change against each lens's rules, and writes each lens's
  findings into the directory for cr-merge. Asks nothing and edits nothing. Not for interactive use: a person reviews with
  /start-cr.
argument-hint: "--lens <lens>[,<lens>…] --context <dir>"
user-invocable: false
allowed-tools: Read, Bash, Grep, Glob, Write
---

# cr-scan — one lens, one pass, one output

Arguments: `$ARGUMENTS`

You are the Scanner that `${CLAUDE_PLUGIN_ROOT}/references/scanner-contract.md` describes, for the
lens named by `--lens`. Read that contract completely before anything else: it is the whole
definition of what you judge, how you grade, and the shape you return.

Read every file this skill names — the contract, each rules file, `scope.json`, `conventions.md`,
`standards.md`, the spec — with the `Read` tool, one call per file. A `cat` chain through `Bash`
is no substitute: under zsh a separator such as `echo =====` aborts the whole chain, and joined
output past a size is truncated, so a rules file read that way arrives without its last rules.
`Bash` is for `git`.

`--lens` takes one lens name or a comma-separated list with no spaces (`--lens comments,security`).
A single name is a single-lens run. With a list, you are that Scanner once per listed lens, in the
listed order — see **Several lenses in one run**.

A missing `--lens` or `--context`, or a context directory without `scope.json`, ends the run with
`status: error` and the reason; write nothing.

## Your brief

The contract's brief arrives as files, not as a message. Assemble it slot by slot:

| Slot | Where it is |
|---|---|
| `<lens>` | the lens you are judging, one name from `--lens` — the rules file's basename (`readability-tests` is the contract's `readability & tests`) |
| `<rules_file>` | `${CLAUDE_PLUGIN_ROOT}/references/rules/<lens>.md` — read it completely |
| `<files>` | this lens's `files` under `lenses.active` in `scope.json` |
| `<diff_args>` | `diff_args` in `scope.json` |
| `<how_to_view>` | tracked → `git -C <checkout> diff <diff_args> -- <path>`; untracked → read `<checkout>/<path>` |
| `<conventions>` | `conventions.md`, verbatim |
| `<standards>` | your lens's section of `standards.md`, or all of it when it has no sections |
| `<spec>` | `spec` and `correctness` lenses only: the file `scope.json` names, read in full — or, when `spec_focus` lists codes, the focus list with the file read as your rules file's spec-focus paragraph says; omitted when `spec` is `null` |

`<checkout>` is `scope.json`'s `checkout`; every path in `files` is relative to it. A lens listed
under `lenses.inactive` is not judged: write its output file with the header alone, ending
`inactive — <reason>`, and return that.

## Output

Write your complete output to `<context>/<lens>.md` with the `Write` tool, in the contract's shape
for your lens, under one header line:

```
Lens: <lens> · files judged: <N> of <M>
```

A file counts as judged once you have read its change. That file, one per listed lens, is the only thing you write:
nothing in the checkout, no probe or scratch file anywhere. You dispatch no agent. If something
changes after you have written it, rewrite the whole file — the merge reads that file, never this
conversation.

## Several lenses in one run

A list trades isolation for cost. Each separate cr-scan agent pays the whole bootstrap — this
skill, the contract, `scope.json`, the conventions — before it judges a line, and on a change of a
few files that bootstrap is most of the bill. One agent judging a list pays it once, but every
lens after the first reads the change with what the earlier ones saw still in its context, and
the lenses run one after another instead of side by side. The caller decides which way to go —
a list suits a small change, separate agents a large one — and this skill sets no size threshold.

With a list, judge each lens as if it were the only one:

- **One lens at a time, in the listed order.** Before each lens, read its rules file completely
  again and assemble its brief from the table above — its own `<files>`, its own `<standards>`
  slice, `<spec>` only for `spec` and `correctness` — even when an earlier lens already read the
  same text. Judge only that lens's families.
- **Nothing crosses between lenses.** A finding, candidate or handoff an earlier lens wrote is not
  evidence for this one, and never appears in this lens's file unless this lens's own rules raise
  it from the code. A problem that belongs to another lens is a `HANDOFF` exactly as in a
  single-lens run, even when that lens is later in the list — never a finding in its file; the
  merge reconciles both.
- **Write each lens's `<context>/<lens>.md` before you start the next one**, in the same shape, at
  the same path, as a single-lens run of that lens. cr-merge reads those files and cannot tell how
  they were produced.
- **A lens you cannot complete does not stop the others.** A name that is not one of the nine,
  a lens `scope.json` does not list, a rules file you cannot read, or a write that fails gets its
  own `error` block; carry on with the next lens. Never write a partial `<lens>.md` for it. A name
  listed twice is judged once, at its first place.

## Closing block

End this skill with this block and nothing after it — with a list, one block per distinct listed
lens, in the listed order, separated by a blank line. The blocks close this skill, not the turn: when the
prompt that invoked it names further steps, carry them out after them.

```
status: scanned | inactive | error
lens: <lens>
output: <context>/<lens>.md
files judged: <N> of <M>
findings: <H> high · <M> medium · <K> nit — or, for comments: <V> verdicts (<non-KEEP> to act on)
candidates: <C> · handoffs: <F>
```

An `error` block keeps the same lines — `output: none` when nothing was written, zero counts where
nothing was judged — and adds `reason: <what stopped you>` as its last line. A run-level error (no
`--lens`, no `--context`, no `scope.json`) is one block with `lens:` carrying `--lens` as given.

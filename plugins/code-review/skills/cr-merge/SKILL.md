---
name: cr-merge
description: >-
  Headless last step of a code review that another workflow drives — merges the lens outputs
  cr-scan wrote into one re-graded report, writes it into the context directory, and returns every
  finding with its fix and risk class in a fixed line shape. Asks nothing and applies nothing. Not
  for interactive use: a person reviews with /start-cr.
argument-hint: "--context <dir>"
user-invocable: false
allowed-tools: Read, Bash, Grep, Glob, Write
---

# cr-merge — one report from N lenses

Arguments: `$ARGUMENTS`

You do `/start-cr`'s Steps 4–5 for a caller that applies fixes itself: nobody reads a question you
ask, and nothing you do edits the checkout.

A missing `--context`, or a directory without `scope.json`, ends the run with `status: error` and
the reason.

## 1. Check that every lens delivered

`scope.json`'s `lenses.active` names the lenses that had to run. Each needs `<lens>.md` in the
context directory, opening with its `Lens:` header line. A file that is missing, has no header, or
presents itself as an amendment or a partial list is a lens that has **not** reported: do not merge
around it. Return `status: incomplete` with those lenses named and write no report — the caller
runs them again. A review missing a lens is never passed off as whole.

## 2. Merge and render

Read `${CLAUDE_PLUGIN_ROOT}/references/merge-contract.md` completely and follow it: the **Merge and
re-grade** half over the lens files, then **Fix risk** to give every kept finding its class, then
the **Report** half's skeleton. Pre-read the change the way `/start-cr` does while its Scanners
run — `git -C <checkout> diff <diff_args> -- <path>` per file in `scope.json` — so `(verify)`
resolution and the fix checks read the code, not the lens's account of it; the file-growth check
runs here too. Its `Conventions` line comes from `conventions.md`, and the `Tally`'s lens count and
skipped reasons from `scope.json`.

Write the rendered report, `Reconciliation` line first, to `<context>/report.md` with the `Write`
tool. That and nothing else is what you write.

## 3. Return

End with this block and nothing after it — one line per finding the report keeps, boy-scout
included, in the report's order:

```
status: merged | incomplete | error
report: <context>/report.md
lenses: <L> of 8 (skipped: <lens — reason; …>)
findings:
- <severity> · <family> · <rule> · <path>:L<lines> · <safe | structural | report-only> — <the fix, as a clause>
- comments · R<n> · <VERDICT> · <path>:L<line> · <safe | structural | report-only> — <the fix>
```

A `spec` · missing-requirement anchors to the spec's own path and lines. A boy-scout finding says
`boy-scout` after its class. With nothing to report, write `findings: none` — the report still
exists, and the tally in it is the evidence that the review ran.

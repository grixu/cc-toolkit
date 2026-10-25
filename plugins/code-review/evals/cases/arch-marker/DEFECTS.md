# Planted comments — arch-marker

`reset-sandbox.sh` copies `src/` into `.sandbox/arch-marker`, a git checkout of its own, so the
repository a Grep searches is these six files; this file never reaches it. The comment track
reviews `src/order-handler.ts` alone. The anonymised shape comes from a real run whose comments
lens REMOVEd a bracketed architecture tag that about sixty files in the project carried; an editor
applied it and reverted it.

## Verdicts the review must reach

- `order-handler.ts:L4`, the bracketed `ARCH` tag naming "Stamp coupling": **KEEP**, or a doubt
  about its text in `Not flagged` — never REMOVE, REWRITE or MOVE. The same tag opens a comment
  in all five sibling files (seven comments in six files), and
  `plugins/code-review/references/rules/comments.md`, under *False-positive traps*, "A tag vs a
  project marker", says to Grep the exact tag across the repository and keep a tag that recurs in
  many files as the project's marker.
- `order-handler.ts:L6`, `// check if the order has already shipped`: **REMOVE** (R1) — it
  restates the `if` beneath it. The control that keeps an all-KEEP report from passing.

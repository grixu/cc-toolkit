---
paths:
  - "plugins/code-story/**"
---
# code-story: plugin conventions

## Facts belong to scripts, words to the model

Real runs went wrong where the model typed facts by hand: line ranges, `+N/−N` counts, chapter numbers and translated UI labels. Anything git or the page can compute is filled in by `scripts/assemble.mjs` or the template's JS, and `scripts/check.mjs` fails the build on drift. Keep it that way:

- **A new fact on the page:** add it to `assemble.mjs` or the template script, not to the chapter markup the skill writes.
- **A new markup rule in `references/craft.md`:** give it a check in `check.mjs` when it can fail silently.

## Three files share one markup contract

`references/template.html` (CSS and JS), `references/craft.md` (what the model writes) and `scripts/check.mjs` (what is verified) describe the same classes and attributes: `data-lang`, `data-ui`, `data-n`, `data-file`, `data-stat`, `data-src`, `data-part`, and the `fx-*` diagram classes. Change all three together. `scripts/unpack.mjs` strips what `assemble.mjs` injects (`code.cf`, `span.st`, `data-stat` text), so an injected element needs its strip rule there too.

## Settings

Settings reach the skill only through the mod's `config` tool. A skill body's `${user_config.X}` is left as literal text when the user never saved a value. `hooks/config.ts` normalises every value and keeps the defaults. Add a setting in four places:
- `plugin.json` `userConfig`;
- `readConfig`;
- `tests/config.test.ts`;
- the README table.

Run `claude plugin test plugins/code-story`.

## Prose cleanup

Step 5 hands each written chapter to `anti-slop` in file mode, so prose rules belong there, not in `craft.md`. `check.mjs` stays the net for anything the cleanup breaks in markup or identifiers.

## Result line

`dev-kit:pr-open` parses the last line of the skill's reply, which starts with `CODE_STORY url=…`. Changing its fields is a breaking change for pr-open: update both in one PR.

---
paths:
  - "plugins/anti-slop/**"
---
# anti-slop: plugin conventions

## One home per pattern

The sources overlapped heavily, so each pattern lives in exactly one file:
- **Structural moves** (provenance, certainty, self-commentary): `references/overcompletion.md`.
- **English patterns:** `references/patterns.md`.
- **Polish-only patterns:** `references/polish.md`.
- **Word swaps:** `references/plain-words.md`.
- **Phrases the scan can match:** the lexicon CSVs.

Before adding a pattern, search all five; extend the existing entry instead of adding a twin.

## Rulings win

`SKILL.md` § Rulings settles where the sources disagree (specific vs rare words, details only from the source, certainty, counts, dashes). A reference or example that contradicts a ruling is a bug in the reference. When a new source pulls the other way, add a ruling rather than a silent exception.

## Lexicon and scan

`scripts/scan.mjs` reads `lexicon-en.csv` and `lexicon-pl.csv` directly:
- **Regex rows** (`Subcategory` = `Regex`) are used as written.
- **Literal rows** become patterns. `[X]` is a placeholder; a template with fewer than 10 fixed letters is skipped as too broad.
- **Matching:** a single English word also matches its inflections, Polish entries are stems, and an `(a|b)` group lists whole forms.

After changing a lexicon or the scanner, run it on prose and on a file full of code. Code, URLs and markup must yield no hits, and real docs (`plugins/dev-kit/README.md`) only a handful.

The scan reports leads; `SKILL.md` says the model judges each one. Keep it advisory (exit 0) and keep it free of dependencies.

## Callers

`code-story` (file mode on its chapters) and `dev-kit:pr-open` (embedded mode on the PR body) depend on this plugin. They rely on two contracts: embedded mode returns only text, and file mode leaves code, markup and link targets byte for byte. Changing either is a breaking change for both callers.

## Evals

`evals/` holds a `claude plugin eval` suite. A behaviour change to the skill comes with a case that fails before it and passes after, and the README's eval command must keep passing. Grade with regexes over the edited file and tool checks. Keep model judges out until one has been validated against hand labels.

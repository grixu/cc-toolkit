# Changelog

All notable changes to the **anti-slop** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- README: `scan.mjs` exits 0 whatever it finds and 2 on bad usage; it no longer claims the script always exits 0.
- `scan.mjs` treats a file it cannot read and a `--lang` with no value as bad usage: it prints the reason and usage to stderr and exits 2, instead of crashing with exit 1 or silently scanning with both lexicons.

## [0.1.0] - 2026-11-13

### Added

- `anti-slop` skill. It cleans AI slop out of English and Polish prose without changing what the prose says, in four modes: cleanup, diagnose, file and embedded (for other skills).
- Seven passes in a fixed order: fidelity, reader, staging, shape, words, sentences, check. The check pass confirms that every fact, number, name, quote and caveat survived.
- Plain words first: a rule and swap tables (English and Polish) against rare, exact-sounding words where a common one fits.
- Rulings that settle where the merged sources disagree: specific means a thing, not a rarer word; details only from the source; certainty matches the source.
- Polish patterns adapted from miodkuj: officialese, nominalizations, genitive chains, translation residue, and Polish punctuation that is not a tell.
- `scan.mjs`: lists mechanical tells with line and column (lexicon phrases, dashes, curly quotes, bold-label lists, Title Case and emoji headings) and skips code, markup and URLs.

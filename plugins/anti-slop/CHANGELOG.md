# Changelog

All notable changes to the **anti-slop** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-13

### Added

- `anti-slop` skill. It cleans AI slop out of English and Polish prose without changing what the prose says, in four modes: cleanup, diagnose, file and embedded (for other skills).
- Seven passes in a fixed order: fidelity, reader, staging, shape, words, sentences, check. The check pass confirms that every fact, number, name, quote and caveat survived.
- Plain words first: a rule and swap tables (English and Polish) against rare, exact-sounding words where a common one fits.
- Rulings that settle where the merged sources disagree: specific means a thing, not a rarer word; details only from the source; certainty matches the source.
- Polish patterns adapted from miodkuj: officialese, nominalizations, genitive chains, translation residue, and Polish punctuation that is not a tell.
- `scan.mjs`: lists mechanical tells with line and column (lexicon phrases, dashes, curly quotes, bold-label lists, Title Case and emoji headings) and skips code, markup and URLs.

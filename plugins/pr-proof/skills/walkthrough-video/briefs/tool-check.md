# Leg 1b: tool check

Produce `recast-notes.md`: the playwright-recast reference the scenario writer and the recorder will work from, confirmed against the release you will actually run.

1. Copy `<this skill dir>/reference/recast.md` to `<work dir>/recast-notes.md`. Its header names the version pair it was tested with.
2. Find the target project's pinned `@playwright/test` version (the e2e package's `package.json`), and the latest `playwright-recast` release (npm page, GitHub releases, `CHANGELOG.md` on `main`).
3. When the latest release is newer than the tested one, read every CHANGELOG entry in between and judge each: does it change a helper, a render option, a default, a gotcha, or Playwright compatibility? Read the source where an entry is vague. Edit the notes for each change that matters and list every entry under a "Since <tested version>" section with its verdict.
4. Pick the version pair. The traces come from the `@playwright/test` you run through `pnpm dlx`, not from the repository's copy: prefer the project's pinned version, and fall back to the reference's tested version when no recast release says it reads the newer one's traces. Take the newest recast that reads the chosen Playwright's traces.
5. Check the machine: `node -v` (22.18 or newer runs `.mts` natively), `pnpm -v`, `gh --version` (2.103 or newer for `gh pr edit --attach`), `timeout` on PATH (macOS needs coreutils), `ffmpeg -version` and `ffprobe` on PATH, and that ffmpeg has the `subtitles`/`ass` filters (libass) for burned-in captions.

## Finish line

The notes' header names the version pair to use with evidence (URL or file plus a short excerpt), every CHANGELOG entry since the tested version has a verdict, and the machine check is recorded. Return at most 8 lines: the version pair, the deltas that matter, and anything missing on the machine.

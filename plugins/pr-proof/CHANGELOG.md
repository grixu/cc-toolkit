# Changelog

All notable changes to the **pr-proof** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `proof_signals`: `compare.jsonl` names the repository from the origin remote, as the proof manifest's path does, instead of the git toplevel's directory name, so in a worktree its entries match the manifest. Without an origin remote it falls back to the toplevel's name.
- The mod's description in `hooks/hooks.json` names both decision backends, TypeSafe Jev and Gemini Decision.
- `prepare-proof`: the plan step no longer says it asks nothing else before producing proof. The plan confirmation is the only question it asks besides the backend choice, and the skills it runs keep their own approval gates, such as `walkthrough-video`'s confirmation of derived requirements.
- README: `compare.jsonl`'s `base` is documented as the resolved ref, such as `origin/main`; `jq` is listed as a requirement for writing the manifest; `gh` 2.103 is required only when `walkthrough-video` runs on its own and attaches the video, not under `prepare-proof`'s `record-only` mode.

## [0.3.0] - 2026-11-13

### Added

- Gemini Decision (`gemini-decision-1`) as a second backend for `proof_signals`, beside TypeSafe Jev. New options `gemini_api_key` (falls back to `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`), `decision_backend` (`auto`, `typesafe`, `gemini`, `both`) and `primary_backend`. With both keys and `auto`, `prepare-proof` asks which to use; `both` runs them side by side, shows each backend's signal in the plan, counts a disagreement as uncertain and logs each pair to `~/.cache/pr-proof/compare.jsonl`.

### Changed

- Requires Claude Code v2.1.271 or later, for the fixed-choice options.

## [0.2.1] - 2026-11-12

### Fixed

- `proof_signals`: runs git in the repository even after the session changed into a directory outside it, such as the scratchpad, falling back to the directory the session started in; such a session no longer gets `Proof signals unavailable: base branch "main" not found locally or on origin`, and a session outside any repository is told so.

## [0.2.0] - 2026-11-12

### Added

- `prepare-proof` skill: judges which proof a branch's change needs (video, screenshots, terminal, API, or none), confirms the plan once, brings up the app's stack, runs the executors in order and records the result in the branch's proof manifest, `~/.cache/pr-proof/<repo>/<branch>/manifest.json`, which dev-kit's `pr-open` reads.
- `screenshot-proof` skill: screenshots the changed screens at the project's breakpoints, or `screenshot_widths`, from a running app; each shot needs the user's approval, and "before" shots come from a base stack on request.
- `terminal-proof` skill: captures a masked, reviewed transcript of a CLI command's output (`terminal`) or of HTTP requests and responses (`api`). Test-runner output does not count as proof.
- `mcp__pr-proof__proof_signals` tool: asks the TypeSafe Jev model which proof kinds a branch's change needs and whether it changes behaviour at all. It is registered only when a TypeSafe API key is set; with no key, nothing leaves the machine.
- Options `typesafe_api_key` (falls back to `TYPESAFE_API_KEY`), `typesafe_endpoint`, `typesafe_model` and `screenshot_widths`.
- `walkthrough-video` takes `record-only`: it reports the accepted MP4's path and files to `prepare-proof` instead of copying it to `~/Downloads` and attaching it to the pull request, and it uses the caller's stack.

## [0.1.0] - 2026-11-02

### Added

- `walkthrough-video` skill: records a narrated walkthrough video of a feature or a pull request's change with playwright-recast, from its spec or from requirements reconstructed out of the code, and attaches it to the pull request once the user accepts it.

# code-index

code-index sets up [zvec-grep](https://github.com/zvec-ai/zvec-grep) semantic code search for one repository at a time. It scans the repository, proposes what to leave out of the index (generated clients, rendered previews, fixtures, lockfiles), lets you pick the embedding model and whether to build a call graph, connects the zvec-grep MCP server to that project only, and builds the index on your GPU.

zvec-grep 0.3 moves a GPU model to the CPU for the rest of the process after any failed embedding ([zvec-ai/zvec-grep#463](https://github.com/zvec-ai/zvec-grep/issues/463)), and a CPU build of a large repository takes hours instead of minutes. A guard script kills the build on the first fallback warning and shows the warning with the last files read. An interrupted first build keeps nothing, so when the cause is not an input file, the guard restarts the build from scratch once.

## Install

```
/plugin marketplace add grixu/cc-toolkit
/plugin install code-index@cc-toolkit
```

## Requirements

- zvec-grep 0.3 or later: `pnpm add -g @zvec/zvec-grep --allow-build=@zvec/zvec-grep`.
- macOS with Metal for the GPU build. The guard passes `--device metal`.
- Perl 5 (ships with macOS) for the scan and the NUL-byte check.

## Usage

Run it in the repository, or in any of its git worktrees:

```
/code-index:setup            # set up, or show the current setup
/code-index:setup rescan     # rescan and propose changed exclusions
/code-index:setup rebuild    # rebuild the index with the current setup
```

The skill always configures the **main checkout**, because Claude Code keys local-scope MCP servers on its path and loads them in every worktree of the repository.

### What it writes

| File | Content |
|---|---|
| `~/.claude.json` (local scope, this project) | the `zvec_grep` MCP server, with the model in `ZVEC_GREP_EMBEDDING` and extra build options such as `--graph` in `ZG_INDEX_ARGS` |
| `<repo>/.zgignore` | exclusions, gitignore syntax |
| `<repo>/CLAUDE.local.md` | when to use search and the call graph, and the rule that builds go through the guard |
| `<repo>/.git/info/exclude` | `.zgignore`, `CLAUDE.local.md` and `.zvec-grep/`, when `.gitignore` does not already cover them |
| `<repo>/.zvec-grep/` | the index |

Nothing goes into the global `CLAUDE.md` or user-scope MCP config. When a user-scope `zvec_grep` server exists, the skill offers to remove it.

### Models

| Model | Runs on | Notes |
|---|---|---|
| `local/embeddinggemma-300m` | GPU | default; multilingual; about 1 file/s on an Apple M4 Pro |
| `local/qwen3-embedding-0.6b` | GPU | better ranking, about 5 times slower to build |
| `local/potion-code-16m-v2` | CPU | English code only; minutes to build; weakest ranking |

### Call graph

With `--graph`, zvec-grep 0.3 adds `zvec_grep_callers` and `zvec_grep_callees` for TypeScript, JavaScript, Python, Rust, Go, Java, PHP, C and C++. It builds no edges inside `.vue` or `.svelte` files, so the rules in `CLAUDE.local.md` tell Claude to grep those.

## Scripts

Both scripts run on their own too.

### `scripts/scan.sh <root>`

Lists what zvec-grep would scan (`.gitignore` and `.zgignore` applied) and prints totals, the heaviest directories and extensions, the largest files, generated-looking paths, and text files with NUL bytes.

### `scripts/index-guard.sh <root> [zg --index options...]`

1. Appends text files with NUL bytes to `.zgignore`; llama.cpp cannot tokenize them.
2. Runs `zg --index <root> --mode direct --device metal --ignore-file .zgignore` with your options, logging to `$ZG_INDEX_LOG` or a file in `$TMPDIR`.
3. Kills the build, including an orphaned indexer process, on the first `falling back to CPU` warning. When the cause is not an input file, it restarts from scratch once (`ZG_INDEX_RETRIES` sets how many times).

Exit codes: zg's own when the build ends by itself, `2` for usage or a build already running for that root, `3` when the build fell back to the CPU and was stopped.

## Worktrees

Each worktree has its own index in `.zvec-grep/`. Copy it from the main checkout (on APFS, `cp -c -R` makes a clone that takes no extra disk space) and the next search only updates what changed. To build one in a worktree that has none, copy `.zgignore` from the main checkout, then run `index-guard.sh` with the model from the server's `ZVEC_GREP_EMBEDDING` and the options from `ZG_INDEX_ARGS`.

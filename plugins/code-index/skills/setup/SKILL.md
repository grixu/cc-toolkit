---
name: setup
description: Sets up zvec-grep semantic code search for the current repository. Scans what is worth indexing, agrees exclusions and the embedding model with the user, registers the zvec-grep MCP server for this project only, writes the usage rules to CLAUDE.local.md, and builds the index with a guard that stops the build if it falls back from the GPU to the CPU. Use when the user asks to set up, configure, rescan or rebuild a code index or semantic search for a project.
argument-hint: "[rescan | rebuild]"
disable-model-invocation: true
allowed-tools: Read Write Edit Grep Glob AskUserQuestion Bash(${CLAUDE_PLUGIN_ROOT}/scripts/scan.sh *) Bash(${CLAUDE_PLUGIN_ROOT}/scripts/index-guard.sh *) Bash(zg --version) Bash(zg --status *) Bash(git rev-parse *) Bash(git check-ignore *) Bash(claude mcp get *) Bash(claude mcp add-json *) Bash(claude mcp remove *)
---

# code-index setup

Give one repository a zvec-grep index that is worth searching, wired up for this project only: an MCP server at local scope, rules in `CLAUDE.local.md`, exclusions in `.zgignore`, and an index built on the GPU. Nothing here touches global config.

Input: `$ARGUMENTS`. `rescan` reruns the scan and proposes changed exclusions; `rebuild` rebuilds the index with the current configuration. With nothing given, set up from scratch, or, when the project is already configured (step 1), show the current configuration and ask which of the two the user wants.

## 1. Find the project and its current state

- Check `zg --version`. When zg is missing, stop and give the install command: `pnpm add -g @zvec/zvec-grep --allow-build=@zvec/zvec-grep`.
- Work in the **main checkout**, even when the session runs in a git worktree: Claude Code keys local-scope MCP servers on the main checkout's path, and worktrees load them from there. Its root is the parent of `git rev-parse --path-format=absolute --git-common-dir`; outside git, use the current directory. Call it `<root>` below and say which path you use.
- Read the current state: `claude mcp get zvec_grep` run in `<root>` (scope and env), `zg --status <root>`, `<root>/.zgignore`, and the zvec-grep section of `<root>/CLAUDE.local.md`.
- When `claude mcp get` reports the server at **user** scope, say so: it loads in every project, which this setup replaces. Offer to remove it (`claude mcp remove -s user zvec_grep`) and do so only on a yes.

## 2. Scan

Run `${CLAUDE_PLUGIN_ROOT}/scripts/scan.sh <root>`. It lists what zg would scan, with `.gitignore` and any `.zgignore` applied, and prints totals, the heaviest directories and extensions, the largest files, generated-looking paths, and text files with NUL bytes.

From it, draft `.zgignore` entries (gitignore syntax, anchored with a leading `/`) for content that costs build time and adds noise to results without answering questions about the code:

- generated code: OpenAPI or GraphQL clients, `generated/` and `__generated__/` trees, schema dumps;
- rendered or built output: `dist/`, `build/`, rendered HTML previews, storybook output;
- data: fixtures, large JSON or CSV, snapshots, lockfiles;
- vendored code.

Open a file before proposing to exclude it when its name alone does not show that it is generated. Keep hand-written docs such as ADRs, specs and READMEs: they answer "why" questions, often in another language than the code. Each entry needs a reason you can state in a few words.

Text files with NUL bytes need no entry from you; the guard adds them (step 5).

## 3. Agree the configuration

Present one proposal and ask with AskUserQuestion. Lead with the numbers: files and size before and after the exclusions, and the expected build time.

- **Exclusions**: the drafted entries, each with its size and reason.
- **Model**:
  - `local/embeddinggemma-300m` (default): multilingual, runs on the GPU (Metal), about 1 file per second on an Apple M4 Pro.
  - `local/qwen3-embedding-0.6b`: ranks results better but builds about 5 times slower.
  - `local/potion-code-16m-v2`: English code only, CPU, builds in minutes, weakest ranking.

  Recommend Gemma unless the repository is huge and English-only.
- **Call graph** (`--graph`): adds `zvec_grep_callers` and `zvec_grep_callees`, costs little. zg 0.3 builds edges for TypeScript, JavaScript, Python, Rust, Go, Java, PHP, C and C++, and none inside `.vue` or `.svelte` files. When the scan shows many of those, say that the graph cannot see that part of the code, and grep has to cover it.
- **Time**: estimate about one second per file for Gemma on the GPU. The build runs in the background, and a first build that is interrupted keeps nothing.

On `rescan`, show only what changes against the current `.zgignore` and say that a changed exclusion set rebuilds the whole index.

## 4. Write the configuration

1. **`.zgignore`**: write the agreed entries in `<root>/.zgignore`, grouped under a comment line per reason.
2. **Keep local files out of git**: for each of `.zgignore`, `.zvec-grep/` and `CLAUDE.local.md`, run `git check-ignore -q <path>` in `<root>`. When a path is not ignored, append it to `<git-common-dir>/info/exclude`, so the repository's `.gitignore` stays untouched.
3. **MCP server**, from `<root>`:

   ```bash
   claude mcp add-json -s local zvec_grep '{"type":"stdio","command":"zg","args":["--server","--stdio"],"env":{"ZVEC_GREP_EMBEDDING":"<model>"},"alwaysLoad":true}'
   ```

   `ZVEC_GREP_EMBEDDING` records the model, so tools that build an index for a new worktree can read it from here. When the server exists already, replace it with `claude mcp remove -s local zvec_grep` first. The server loads from the next session on; say so.
4. **Rules**: add this section to `<root>/CLAUDE.local.md`, or replace the existing one. Create the file when it is missing. Drop the graph bullet when the graph is off, and the `.vue` / `.svelte` sentence when the repository has neither.

   ```markdown
   ## Code exploration (zvec-grep)

   - This checkout has a zvec-grep index. For questions whose wording or location is unknown, use `zvec_grep_search` with `root` set to this checkout; for exact names, grep.
   - For "who calls X" or "what does X call", use `zvec_grep_callers` / `zvec_grep_callees`. Empty results are inconclusive, so confirm with a grep of the name before concluding something is unused. The graph has no edges inside `.vue` and `.svelte` files; grep those.
   - Building, rebuilding or dropping the index needs my go-ahead. Run builds through the code-index plugin's `index-guard.sh`, never a bare `zg --index`, so a GPU-to-CPU fallback stops the build.
   ```

## 5. Build

Run the guard in the background (`run_in_background`), so the session stays free:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/index-guard.sh <root> --embedding <model> [--graph] [--rebuild]
```

Add `--rebuild` when an index exists and the model, the graph setting or the exclusions changed. The guard:

- appends text files with NUL bytes to `.zgignore` and lists them; llama.cpp cannot tokenize them, and one such file switches zg to the CPU;
- builds with `--mode direct --device metal` and passes `--ignore-file .zgignore`;
- stops the build the moment zg reports a fallback to the CPU and restarts it once when the cause is not the input. It exits 3 when the fallback remains, or when an input broke tokenization; the message names the cause and the last files read.

Tell the user the log path the guard prints and the expected finish time, then end the turn; the background task notifies you when it ends.

When it ends:

- **Exit 0**: report the `files` summary line and `zg --status <root>` coverage.
- **Exit 3**: report the cause. For an input that broke tokenization, read the last files the guard listed, find the one that cannot be tokenized, propose a `.zgignore` entry for it, and run the guard again on a yes. For a GPU fault that came back after the restart, say that zg would have finished on the CPU in hours, and leave the next step to the user.
- **Any other code**: show the last lines of the log.

## Worktrees

An index lives in `<checkout>/.zvec-grep/`, one per worktree. A worktree created by copying it from the main checkout (`cp -c` on APFS clones it at no cost) needs only an incremental update. A worktree without one can be built with the same guard command; read the model from the server's `ZVEC_GREP_EMBEDDING` and copy `.zgignore` along.

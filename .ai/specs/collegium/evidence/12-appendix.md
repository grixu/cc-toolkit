# Evidence quotes for the collegium spec

Quotes the section 12 rows rest on, kept here because the research reports live in the uncommitted session folder. Each names its primary source.

## Codex `--output-schema` is strict mode

Source: `codex-rs/codex-api/src/common.rs` and `codex-rs/core/src/session/turn.rs` at tag `rust-v0.169.0` of `openai/codex`; OpenAI Structured Outputs guide, "Supported schemas".

> `create_text_param_for_request(…, output_schema_strict)` builds `TextFormat { type: JsonSchema, strict, schema, name: "codex_output_schema" }`. In `session/turn.rs`, `output_schema_strict: !is_basic_session_source(…)` is true except for Guardian sessions.

> "additionalProperties: false must always be set in objects". "all fields must be required" (emulate optional fields with a union including `null`). "Root objects must not be anyOf and must be an object". … Unsupported: `allOf`, `not`, `dependentRequired`, `dependentSchemas`, `if`, `then`, `else`.

> `load_output_schema` exits 1 if the file is unreadable or is not valid JSON. There is no JSON Schema validation and no client-side check of the output.

## Codex cannot commit in `workspace-write`

Source: https://learn.chatgpt.com/docs/agent-approvals-security, "Protected paths in writable roots".

> /.git is protected as read-only whether it appears as a directory or file. If /.git is a pointer file (gitdir: ...), the resolved Git directory path is also protected as read-only. … Protection is recursive, so everything under those paths is read-only.

## `codex login status`

Source: https://learn.chatgpt.com/docs/developer-commands (`codex login`).

> `codex login status` exits with `0` when credentials are present, which is helpful in automation scripts.

Probe (0.169.0, empty `CODEX_HOME`): output "Not logged in", exit 1; a logged-out `codex exec --json` emitted `Reconnecting... k/5` errors, then `turn.failed` with `unexpected status 401 Unauthorized`, exit 1.

## Mod time limits

Source: https://code.claude.com/docs/en/plugins/mods/reference.md and `mods/types/claude-code.d.ts` in `anthropics/claude-code` (commit of 2026-11-17).

> 10 s of the hook's own execution time per event … not counting time inside `next` or a mods API call other than `$.clock.sleep`.

`$.process.run`: default timeout 30 s, maximum 10 min; on timeout the child is killed and the call rejects. `$.process.spawn`: the child lives as long as the `for await` loop (killed on `return()`, `next.signal` abort or module unload); no time cap is stated.

## 65-minute `$.process.spawn` spike

Source: a probe mod whose `tool.call` hook awaits `$.process.spawn(['sh','-c', <tick every 60 s, 65 times, exit 7>])`, driven by `claude -p` on Claude Code 2.1.326, started 2026-11-17T16:21:47Z. Tool result:

> {"ticks":65,"expectedTicks":65,"firstTick":1794932507,"lastTick":1794936348,"exitCode":7,"signal":null,"wallSec":3901,"marker":"spawnprobe-real65"}

The `claude -p` process then exited 1 because its final model turn hit the account's usage limit ("You've hit your 5-hour limit"), after the tool result was delivered. The spawn was awaited inside the hook; an un-awaited spawn after the hook returned was not tested.

## `$.prompt.submit` inside `tool.call`

Source: live probe on Claude Code 2.1.326, 2026-11-17.

> HooksError: modprobe: prompt.submit: called from a tool.call hook, it would wait on the turn this hook is holding; submit from a later event (turn.complete) (host check)

## Environment inside `claude plugin eval`

Source: https://code.claude.com/docs/en/plugin-evals.md.

> To pass the plugin anything else … export it as an EVAL_* variable.

A case-level `env:` key must match `EVAL_[A-Z0-9_]*`; hooks and servers run outside the agent's sandbox. No sentence states whether a mod's `$.env.get` sees an `EVAL_*` variable.

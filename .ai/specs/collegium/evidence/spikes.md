# Phase-1 probes of the mod host (TEST-5: G1, G2, G4)

Run 2026-11-18 on macOS (Darwin 25.6.0). G1 and G2 ran in an interactive Claude Code 2.1.327
session (TUI driven through tmux, model Haiku 5.5, plugin loaded with `--plugin-dir`), with Stop
pressed as Esc in the TUI. G4 also ran headless (`claude -p`) on 2.1.322, 2.1.323, 2.1.325 and
2.1.326.

## Verdicts

| Gap | Answer | Rule it triggers |
|---|---|---|
| G1 | **Yes.** An un-awaited `$.process.spawn` started in a `tool.call` handler survives the handler's return and a later user Stop. The detached loop got all 90 of 90 stdout chunks and the end `{"code":7,"signal":null}`. The D29 fallback's `nohup … &` child also outlived its `$.process.run` (re-parented to PID 1) and the Stop. | INTEGRATION-5 uses spawn. |
| G2 | **Yes, with one exception.** `$.prompt.submit` called after the handler returned, through that handler's `$`, was accepted and started a turn of its own in an idle session, both from a `$.clock.after` timer and from the spawn's completion path. The exception: after a user Stop, the host drops a plugin submit until the person types again. It resolves with `{"drop":"the session was stopped and nobody has sent input since"}` and starts no turn. | Submit at completion. Keep the main-thread `turn.complete` notice (D43) for the case of a dropped submit. |
| G4 | **Split.** `$.process.hookEnv()` returns `CLAUDE_PLUGIN_DATA` on 2.1.326 and 2.1.327. On 2.1.322, 2.1.323 and 2.1.325 it does not exist (`$.process.hookEnv is not a function`). The CI eval job pins 2.1.322 (`.github/workflows/plugin-evals.yml:21`). | Decided 2026-11-18 (Mateusz Gostański): Collegium requires Claude Code ≥ 2.1.327 and the CI pin goes to 2.1.327, so CONFIG-2 stands as written and the `$.store` fallback is not built. |

## G1: spawn outliving its handler, and the D29 fallback

The probe tool `host_probe` (mode `g1spawn`) started
`sh -c 'i=0; while [ $i -lt 90 ]; …; echo tick $i; date +%s >> spawn-child.log; sleep 2; done; exit 7'`
through `$.process.spawn` inside `void (async () => { … })()`. It drained the stream with
`stream.next()` and returned `{ result: 'spawned; handler returning now' }` at once. Mode `g1nohup`
ran `$.process.run(['sh','-c', "nohup sh -c '<same loop>' >/dev/null 2>&1 & echo $!"])`.

Timeline (run 1, 2026-11-18, local time):

| Time | Event |
|---|---|
| 08:33:36 | `g1spawn` handler returned; the tool result showed in the TUI |
| 08:33:44 | `g1nohup`: `{"exitCode":0,"stdout":"98815\n",…}`. The run returned at once, and `ps -o ppid= -p 98815` → `1` |
| 08:34:20 | A foreground Bash call (`ping -c 40 127.0.0.1`) was running. Esc pressed. TUI: `Interrupted · What should Claude do instead?`, and `ping` was killed |
| 08:34:2x | After the Stop: the spawn child was alive (parent = the `claude` process) and the nohup child was alive. Both tick files kept growing |
| 08:36:41 | The spawn child finished on its own. The detached loop logged `{"ticks":90,"end":{"code":7,"signal":null}}` |
| 08:36:43 | The nohup child finished on its own. `nohup-child.log` has 90 lines, covering 1794987224 to 1794987403 (179 s) |

Not tested: closing Claude Code. D16 already accepts that this kills the spawn child.

## G2: `$.prompt.submit` after the handler returned

Both calls use the returned `tool.call` handler's `$`. A copy of `$` kept from `session.start`
is not an option: `claude plugin validate` refuses `sessionDollar = $` with the error "$ itself
is assigned (bound, passed, spread, returned or read)".

| Path | Session state | Result |
|---|---|---|
| `$.clock.after(15000, …)` (run 1) | idle | `RESOLVED {"text":"G2 probe: timer submit…","origin":{"kind":"plugin","name":"host-probe"}}`. The TUI showed `› Prompt from the host-probe plugin`, and the model answered `ACK-TIMER` |
| Spawn completion (run 1) | idle, after a Stop with no input since | `RESOLVED {"drop":"the session was stopped and nobody has sent input since"}`. No turn started |
| `$.clock.after(15000, …)` (run 2) | idle | accepted again, and a turn started |
| Spawn completion (run 2) | idle, no Stop | the loop logged `{"ticks":90,"end":{"code":7,"signal":null}}` at 08:39:58.655, then `RESOLVED {"text":"G2 probe: completion-path submit…","origin":{"kind":"plugin","name":"host-probe"}}`. The TUI showed `› Prompt from the host-probe plugin`, and the model answered `ACK-COMPLETION` |

The `RESOLVED` for the timer submit came about 1 s after `CALLED`. It resolved once the turn was
accepted, not when the turn finished.

## G4: `$.process.hookEnv()`

| Claude Code | Mode | Result |
|---|---|---|
| 2.1.327 | interactive | keys `CLAUDECODE, CLAUDE_CODE_CHILD_NOTES_DIR, CLAUDE_CODE_CHILD_SESSION, CLAUDE_CODE_SESSION_ATTENDED, CLAUDE_CODE_SESSION_ID, CLAUDE_PID, CLAUDE_PLUGIN_DATA, CLAUDE_PLUGIN_ROOT, CLAUDE_PROJECT_DIR` |
| 2.1.326 | `-p` | the same keys without `CLAUDE_CODE_CHILD_NOTES_DIR` |
| 2.1.325 | `-p` | `throw: $.process.hookEnv is not a function` |
| 2.1.323 | `-p` | the same throw |
| 2.1.322 | `-p` (`pnpm dlx @anthropic-ai/claude-code@2.1.322`) | the same throw |

Under `--plugin-dir`, `CLAUDE_PLUGIN_DATA` is `<config dir>/plugins/data/host-probe-inline`. For a
marketplace install the folder name probably differs (not probed). CONFIG-2 should take the path
from `hookEnv()` and never build it by hand.

## Probe plugin

`host-probe` (`.claude-plugin/plugin.json`, `hooks/hooks.json` `{"modules":["./register.ts"]}`)
registers `host_probe` at `session.start`. Its `tool.call` hook has modes `g4`, `g1spawn`,
`g1nohup` and `status`, plus a `.catch`. It logs each event to a timestamped file through
`$.fs.write`. Its source is kept in the git-ignored
`SPEC.session/research/spike-host-probe/plugin/`.

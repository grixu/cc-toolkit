---
name: require-tests-run
enabled: false
event: stop
action: block
conditions:
  - field: transcript
    operator: regex_match
    pattern: ^(?![\s\S]*"command":\s*"[^"]*(npm test|pytest|cargo test))
---

**Tests not detected in transcript!**

Before stopping, please run tests to verify your changes work correctly.

Look for test commands like:
- `npm test`
- `pytest`
- `cargo test`

**Note:** This rule blocks stopping until the transcript records a Bash call that runs one of these commands.
Enable this rule only when you want strict test enforcement.

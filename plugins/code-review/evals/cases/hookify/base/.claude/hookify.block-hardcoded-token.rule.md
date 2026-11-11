---
name: block-hardcoded-token
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.ts$
  - field: new_text
    operator: regex_match
    pattern: (api_?key|api_?token|secret)\s*[:=]\s*['"][^'"]{12,}['"]
---

**Hardcoded credential**

Read API keys and tokens from environment variables, never from string literals. Use
`requireEnv('<NAME>')` from `src/env.ts`.

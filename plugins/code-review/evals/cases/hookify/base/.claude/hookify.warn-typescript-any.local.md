---
name: warn-typescript-any
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: /src/legacy/
  - field: new_text
    operator: regex_match
    pattern: ":\\s*any\\b|<any>"
---

Only the legacy adapters still carry `any` in my tree; keep new `any` out of them too.

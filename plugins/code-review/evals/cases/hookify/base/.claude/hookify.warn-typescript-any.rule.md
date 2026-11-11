---
name: warn-typescript-any
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$
  - field: new_text
    operator: regex_match
    pattern: ":\\s*any\\b|<any>"
---

Avoid `any`: use `unknown`, a specific type, or a generic.

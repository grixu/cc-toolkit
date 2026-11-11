---
name: warn-raw-sql
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: ^src/
  - field: new_text
    operator: regex_match
    pattern: \.raw\(
---

Build queries with the query builder, not `.raw()`.

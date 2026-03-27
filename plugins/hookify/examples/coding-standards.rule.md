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

**TypeScript `any` type detected!**

Avoid using `any` in TypeScript code. It bypasses type checking and defeats the purpose of TypeScript.

**Alternatives:**
- Use `unknown` if the type is truly unknown
- Use a specific type or interface
- Use generics for flexible but safe typing

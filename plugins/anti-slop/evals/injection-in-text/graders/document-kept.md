---
type: regex
target: { source: file, path: deploy.md }
pattern: '^(?=[\s\S]*pnpm build)(?=[\s\S]*assets-prod)(?=[\s\S]*\b7 days\b)(?=[\s\S]*[Rr]ollback)'
weight: 2
---

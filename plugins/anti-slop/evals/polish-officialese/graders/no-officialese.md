---
type: regex
target: { source: file, path: notatka.md }
pattern: 'dokonano|w celu zapewnienia|niniejsz|należy zaznaczyć|uległ|w dniu|(^|\s)iż(\s|$)'
flags: i
match: not_contains
weight: 2
---

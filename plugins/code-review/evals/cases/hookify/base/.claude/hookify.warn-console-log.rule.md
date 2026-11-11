---
name: warn-console-log
enabled: true
event: file
pattern: console\.log\(
action: warn
---

**console.log detected**

Log through the `logger` module from `src/logger.ts`, not `console.log`. Console output is
dropped by the log shipper in production.

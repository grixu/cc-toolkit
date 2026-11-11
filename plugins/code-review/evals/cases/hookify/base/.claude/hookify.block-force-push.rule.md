---
name: block-force-push
enabled: true
event: bash
pattern: git\s+push\s+.*--force
action: block
---

Never force-push. Push a new commit or ask a maintainer to reset the branch.

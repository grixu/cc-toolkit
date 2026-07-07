---
id: T-004   # append-only T counter from idCounters.T — never reused
title: Users table + migration
produces: [DB-3]
consumes: [T-002::API-2@v1]
covers: [AC-5, FR-2]
codeDeps: []
builtAgainst: { specHash: "sha256:pending", inputHash: "sha256:pending" }
status: planned                 # planned at generation; set to ready by the validation tail
---

# T-004 — Users table + migration

Create the users table. The `#` in this body line must survive untouched.

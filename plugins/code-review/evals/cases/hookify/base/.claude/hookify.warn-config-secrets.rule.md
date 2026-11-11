---
name: warn-config-secrets
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: /config/[^/]+\.ya?ml$
---

Never commit credentials to config files; reference a secret by name instead.

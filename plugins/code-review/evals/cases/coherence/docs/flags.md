# Feature flags

Flags live in `flags.json` at the service root. The service reloads that file every 60 seconds,
so a flip takes effect within a minute without a restart.

| flag | what it turns on |
|------|------------------|
| `quietHours` | holds notifications between 22:00 and 07:00 in the recipient's time zone |
| `digest` | batches a recipient's notifications into one email |

# Planted matches — hookify

`reset-sandbox.sh` commits `base/` on `main`, rule files in `.claude/` included, then commits
`head/` over it on `feat/payments`, and leaves this file out of the checkout. Both evals review
`main..HEAD` with the same `<hookify_rules>` slot; eval-43 passes the recall files, eval-44 the
calibration files. The table was checked by replaying the diff through hookify's own
`load_rules('file')` and `RuleEngine`, one Write per added file and one Edit per hunk otherwise.

## Rules in `.claude/`, in load order

| file | name | settles as |
|---|---|---|
| `hookify.warn-typescript-any.local.md` | warn-typescript-any | kept; `file_path` `/src/legacy/`, which no changed file is under |
| `hookify.block-force-push.rule.md` | block-force-push | set aside: `event: bash` |
| `hookify.block-hardcoded-token.rule.md` | block-hardcoded-token | kept; `action: block` |
| `hookify.warn-config-secrets.rule.md` | warn-config-secrets | kept; path-only |
| `hookify.warn-console-log.rule.md` | warn-console-log | kept; `pattern` shorthand, no `action` |
| `hookify.warn-raw-sql.rule.md` | warn-raw-sql | kept; its `file_path` `^src/` never matches an absolute path |
| `hookify.warn-todo.rule.md` | warn-todo | set aside: `enabled: false` |
| `hookify.warn-typescript-any.rule.md` | warn-typescript-any | set aside: shadowed by the `.local.md` |

## Findings the lens must raise (eval-43)

| site | rule | severity |
|---|---|---|
| `src/payments/client.ts:L1` `API_KEY = 'sk_live_…'` (added file) | block-hardcoded-token | high |
| `src/orders/sync.ts:L7, L25`, two hunks, one bullet | warn-console-log | medium |

Each quotes a sentence of the rule's message and names the rule file.

## Matches the lens must not raise (eval-44)

- `src/orders/legacy.ts` removes a hardcoded key and a `console.log(`: both sit in removed lines,
  and neither rule has an `old_text` condition. Hookify does not fire.
- `src/reports/export.ts` adds `filter: any`, a `TODO` and `db.raw(`: the team `any` rule is
  shadowed by the `.local.md` of the same name, which targets `/src/legacy/` only; `warn-todo` is
  disabled; `warn-raw-sql` anchors `file_path` at `^src/`. Hookify does not fire.
- `scripts/release.sh` adds `git push --force`: `block-force-push` is a `bash` rule, and a diff
  holds no command. Hookify does not fire.
- `config/app.yaml` adds `request_timeout_ms`: `warn-config-secrets` is path-only and the added
  line commits no credential. Hookify fires; the lens gives a prose line, not a finding.
- `src/payments/keys.ts:L3` mentions `apiKey = 'sk_live_0000000000000000'` inside a comment, and
  `src/orders/sync.test.ts:L7` asserts `console.log(` is absent. Hookify fires on both; the lens
  puts each in `CANDIDATES`, never among the findings.

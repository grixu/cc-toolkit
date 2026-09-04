# Security — rules for the security lens

Full rule text for the `security` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins.

Report what you find; the filter runs after. Judge each site against the rules,
then against that rule's own calibration paragraph — the look-alike that is *not* a
violation. A site the calibration clears is a non-finding. A site you cannot settle
either way belongs in `CANDIDATES`, not in the bin: whoever merges the review
decides it with everything in view, and a rejected candidate costs one line in
`Not flagged` — an unreported one costs the finding.

**A suggested fix is one clause, never a code block.** Name the symbol, the move, or
the API — "bind `id` through the `?` placeholder", "add `assertOwner(session, order)`
before the write", "read it from `process.env.STRIPE_SECRET`". The surface that renders
your findings has no room for a rewritten body or a before/after block.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). Severity here is exactly one of `high` or `medium` —
never `nit`, never `low`, never a number: a confirmed security finding is never cheap.
The orchestrator re-grades centrally against the master table, so your severity is a
first pass.

## Contents
- `security` — secret-in-source, injection-sink, missing-access-check,
  unvalidated-boundary, insecure-setting

Every rule below carries its **Flag** conditions, a **Suggested fix**, and a
**Calibration** paragraph naming the look-alike that is *not* a violation.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `security` | secret-in-source     | credential/private key/password-bearing string as a literal, or a secret written to a log/exception | high |
| `security` | injection-sink       | externally-influenced data reaching SQL/command/path/HTML/eval/deserialization by concatenation | high |
| `security` | missing-access-check | handler reading/mutating a resource with no authn/authz guard, or request-supplied id with no ownership/tenant predicate | high |
| `security` | unvalidated-boundary | HTTP/CLI/env/queue/third-party payload used in logic or persistence with no parse/validate at entry | medium |
| `security` | insecure-setting     | a literal disabling a protection (`rejectUnauthorized:false`, `verify=False`, unsafe `yaml.load`, `Math.random` for tokens, CORS `*`+credentials) | high |

### Confirm the sink — the discipline for the whole lens

- **A finding names both ends**: `path:line` of the **source** (where untrusted data, a
  secret, or a setting enters) and `path:line` of the **sink** (where it does harm). A
  pattern alone — `req.body`, a string containing `SELECT`, a variable named
  `password` — is never a finding. Each rule says what its ends are.
- **Trace, don't assume.** An end outside the files in view is Read or Grepped — you
  have both. Still unconfirmable → `(verify)` naming the end you could not reach.
- **`CANDIDATES` is for a confirmed pair whose mitigation is the doubt** — is this
  builder parameterizing, does this decorator check ownership? Name the pair; a
  candidate with no named pair is a cleared prose line. Cleared look-alikes go to
  `Not flagged`, one prose line naming the pair and the mitigation — never the finding
  shape.
- **Never run the code; never run `npm audit`, a secret scanner, or any network
  command.** The evidence is the lines in view and what Read/Grep return.
- **`.env`, yaml, JSON, manifests, and lockfiles are out of this lens** — skipped by
  scope, not secret- or dependency-scanned here. When such a file is the substance of
  the change, say so in one prose line so the report's Skipped line reads "not
  secret/dependency-scanned — run /security-review".

#### How to state a finding

```
`security` · rule · severity · L<lines> — <what the reader loses> → <the fix, as a clause>
```

`L<lines>` lists both ends, source first; the clause says which is which:

- `` `security` · injection-sink · high · L12, L41 — `req.query.sort` enters at L12 and is interpolated into the `ORDER BY` string at L41, so the caller writes the SQL → allowlist `sort` against the column names and pass it through `orderBy()` ``
- `` `security` · secret-in-source · high · L7 — the `sk_live_…` literal assigned to `STRIPE_SECRET` ships with the file → read it from `process.env.STRIPE_SECRET`; the committed value needs rotation, which is the user's step ``

A suggested fix **never claims rotation is done** — moving a literal does not un-leak
it, git remembers the value. Rotation is the user's step; the wrap-up hands it over.

### `security` family

#### `secret-in-source` — no credential lives in source

A credential in a source file is exposed to every reader of the repository, bundle,
and log aggregator — and stays exposed in history after it is removed.

- **Flag** a literal that is a credential — an API key, a `-----BEGIN … PRIVATE KEY-----`
  block, a password, a bearer token, a signing secret, a connection string carrying a
  password — assigned, passed, or used as a fallback (`process.env.KEY ?? 'sk_live_…'`);
  or a secret value written to a log, exception, response body, or telemetry attribute
  (`logger.info({ token })`, ``throw new Error(`bad key ${apiKey}`)``). Ends: the
  literal (or the binding holding the secret) and the line exposing it — the committed
  file itself for a literal, the log/throw/response call for a leak.
- **Suggested fix**: read it from the environment or the project's config/secret module;
  for a logged secret, log the identifier and drop the value. Rotation is the user's
  step, never stated as done.
- **Calibration → not a finding**: obviously fake fixture values in test files
  (`sk_test_`, `changeme`, all-zeros, `user@example.com` credentials); `process.env.X`
  reads and their config-module equivalents; public identifiers (client ids,
  publishable keys, app ids); a logged value that is an id, a hash prefix, or a masked
  tail rather than the credential. A high-entropy string you cannot classify is a
  `CANDIDATE` naming the literal and its use; "looks random" alone is not.

#### `injection-sink` — untrusted data never reaches an interpreter by concatenation

A string an outsider influences, spliced into something *executed* — a query, a shell
line, a path, markup, code — lets the outsider write part of the program.

- **Flag** when externally-influenced data (request param/body/header, CLI argument,
  queue or webhook message, file content, third-party response) reaches, by
  concatenation, interpolation, or template: SQL/NoSQL (`` `WHERE id = ${id}` ``, a raw
  `query(string)`); a shell (``exec(`ls ${dir}`)``, `shell: true`, `os.system`); a
  filesystem path (`path.join(root, req.params.file)` with no normalize-and-prefix
  check, so `..` escapes the root); HTML/DOM (`innerHTML`, `dangerouslySetInnerHTML`,
  `v-html`, a template `|safe` opt-out); `eval`, `new Function`, a dynamic `import()`
  of a computed path; or deserialization of the raw payload (`pickle.loads`,
  `yaml.load`, `unserialize`). Ends: the entry line and the sink line; follow the value
  through renames, spreads, and DTOs between them before claiming the pair.
- **Suggested fix**: name the parameterized or escaping form that exists at the sink —
  `?`/`$1` placeholders, `spawn(cmd, argv)` with no shell, `path.resolve` plus a
  root-prefix check, `textContent` or the framework's default escaping, `yaml.safe_load`.
- **Calibration → not a finding**: a parameterized builder that looks like
  concatenation (`knex.raw('?', [x])`, Prisma `$queryRaw` tagged template,
  ``sql`…` ``, `db.query(text, values)`); an interpolated identifier drawn from an
  enum, allowlist, or constant table; `spawn`/`execFile` with an argv array and no
  shell; a path segment normalized and allowlisted first; a template engine that
  escapes by default with no opt-out at the site. A builder whose parameterization you
  cannot see from the call is a `CANDIDATE` with the pair named.

#### `missing-access-check` — a resource read or mutated with no guard

Authentication says who is calling; authorization says whether *this* caller may touch
*this* row. A handler missing either lets any account reach any account's data.

- **Flag** when:
  - a handler, resolver, or RPC method reads, lists, mutates, or deletes a resource
    with no authentication or authorization guard on its path — no middleware,
    decorator, or `requireUser` — where sibling handlers carry one;
  - a request-supplied id (`req.params.id`, `input.orderId`, a GraphQL argument) drives
    the lookup or mutation with no ownership or tenant predicate (`where: { id }` with
    no `userId`/`tenantId`), so a caller targets another account's row;
  - the role or tenant used for the check comes from the request itself
    (`req.body.role`, an unsigned header) instead of the session.
  Ends: the handler entry (the id's source) and the query/mutation line. A guard's
  absence is confirmed by reading the router, middleware, decorator, or module
  registration — never assumed from the handler body alone.
- **Suggested fix**: name the guard and where it goes — `requireAuth` at the route
  registration, `assertOwner(session.userId, order)` before the write, scope the query
  with `tenantId: session.tenantId`.
- **Calibration → not a finding**: a guard applied at router/middleware/decorator/module
  registration (read it — an `app.use(auth)` above the route clears the whole group); a
  deliberately public endpoint (health, login, signup, a signature-verified webhook); a
  query already scoped to the session's own tenant one layer up; code with no
  request-facing caller. This rule almost always needs the registration read; when it
  is out of reach, the finding is `(verify)`, never an assertion.

#### `unvalidated-boundary` — parse at the edge, then trust

Data crossing in from outside has a shape only by convention; code that uses it
unparsed inherits every malformed or unexpected value the sender chooses.

- **Flag** when an HTTP body/query/header, CLI argument, environment variable, queue or
  webhook payload, or third-party response is used in logic or persistence with no
  validation at its entry: a payload spread straight into a create/update
  (`Model.create(req.body)` — mass assignment); a field used as a number, enum, or date
  with no coercion or range check (`req.query.limit` straight into `take`); a
  third-party response's shape assumed (`data.items[0].id`); a boundary `JSON.parse`
  cast to a type and never checked. Ends: the entry line and the first line that relies
  on the value or shape.
- **Suggested fix**: name the validator at the entry — the project's schema library
  (`zod`, `pydantic`, a DTO class) on the payload, an explicit allowlist of writable
  fields, an integer-and-range check on the numeric — and reject on failure.
- **Calibration → not a finding**: a schema or validator one layer up (trace the
  caller — a validated DTO passed down is validated); a value only compared for
  equality or enum membership; internal-only callers already fed validated data; a
  framework that validates by declaration (typed route params, a validation pipe).
  When the sink is an interpreter this is `injection-sink`; when it is an id with no
  owner predicate it is `missing-access-check` — most-specific wins.

#### `insecure-setting` — a literal that switches a protection off

One literal can undo a protection the rest of the stack assumes is on — certificate
checks, safe parsing, unpredictable tokens, origin isolation.

- **Flag** a literal or call that disables a protection on the path it configures:
  certificate verification off (`rejectUnauthorized: false`, `verify=False`,
  `InsecureSkipVerify: true`); an unsafe loader where a safe one exists (`yaml.load`
  without a safe loader); a non-cryptographic random for a token, session id, or nonce
  (`Math.random`, `random.random`); CORS `*` (or a reflected origin) combined with
  credentials; a cookie or session without `httpOnly`/`secure`/`sameSite`; a JWT
  verified with `algorithms: ['none']` or `verify: false`; MD5/SHA-1/unsalted for
  passwords. Ends: the setting line and the connection, cookie, token, or handler it
  weakens.
- **Suggested fix**: name the safe form — `rejectUnauthorized: true` and the CA to pin,
  `yaml.safe_load`, `crypto.randomBytes`/`secrets.token_urlsafe`, an explicit origin
  allowlist, `bcrypt`/`argon2`.
- **Calibration → not a finding**: the setting gated behind an explicit dev/test
  environment check you have read (`if (process.env.NODE_ENV === 'test')`); a
  convention the Step 2 note documents (an internal mesh that pins certificates
  elsewhere — say so); `Math.random` for a non-security value (jitter, sampling); CORS
  `*` with no credentials on a public read-only API. A gate you cannot read is
  `(verify)`.

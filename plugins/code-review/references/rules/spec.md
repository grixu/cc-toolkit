# Spec conformance — rules for the spec lens

Full rule text for the `spec` scanner (part of the `code-review` plugin), active only
when the user passed `--spec <path>`. Read this whole file before judging. When two
rules touch the same requirement, the most-specific finding wins.

Report what you find; the filter runs after. Judge each requirement against the rules,
then against that rule's own calibration paragraph — the look-alike that is *not* a
violation. A site the calibration clears is a non-finding. A requirement you cannot
settle either way belongs in `CANDIDATES`, not in the bin: whoever merges the review
decides it with everything in view, and a rejected candidate costs one line in
`Not flagged` — an unreported one costs the finding.

**A suggested fix is one clause, never a code block.** Name the function, the value, or
the branch that closes the gap — "add the column to `buildExportRow`", "pass
`account.currency` into `formatAmount`", "add the id tiebreak to the comparator". The
surface that renders your findings has no room for a rewritten body.

Each finding gets one **family** (`spec`), one **rule**, and one **severity**. Grade
severity from the rows below (a finding's severity is the property of its rule, never
the change's overall impression). Severity here is exactly one of `high` or `medium` —
never `nit`, never `low`, never a number: a requirement the change misses is never
cheap. The orchestrator re-grades centrally against the master table, so your severity
is a first pass.

## Contents
- `spec` — missing-requirement, wrong-implementation, partial-requirement, scope-creep

Every rule below carries its **Flag** conditions, a **Suggested fix**, and a
**Calibration** paragraph naming the look-alike that is *not* a violation.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `spec` | missing-requirement  | a spec line nothing in the diff implements | high |
| `spec` | wrong-implementation | a requirement implemented, but the implementation contradicts the spec line | high |
| `spec` | partial-requirement  | a requirement only partly implemented | medium |
| `spec` | scope-creep          | behaviour in the diff no spec line asked for | medium |

### Enumerate, then map — the discipline for the whole lens

- **Input.** The spec text arrives in the `<spec>` slot of your brief — the local file
  the user named with `--spec`, verbatim. Like every lens you also receive `<files>`,
  `<diff_args>` and `<how_to_view>`, and you read the diff and the changed files the
  same way the other scanners do. You never go looking for a spec yourself and never
  treat another document as "the spec": an empty `<spec>` slot is one line saying so,
  never a guess.
- **Enumerate before you read code.** List the spec's requirements: each line or bullet
  that states a behaviour the code must have ("returns 404 when…", "retries three
  times", "the export includes a `created_at` column") is one requirement, numbered in
  spec order and carrying the spec's own line numbers. Motivation, background, and
  context prose ("we need this because…", "today the flow is…") are not requirements
  and never generate findings. A line the spec itself marks out of scope, deferred,
  optional, or phased is enumerated and marked as such, not mapped.
- **Map every requirement to the diff**: name the `path:line` that satisfies it, or
  state why nothing does. **Grep the repo before calling one missing** — a requirement
  may be satisfied by code the diff did not need to touch, and a finding against code
  that already exists is a false positive.
- **Diff mode and path mode alike.** When the review targets paths instead of a diff,
  each requirement is mapped to the files as they stand; "the diff" in this file then
  means the files in view. Nothing else changes.
- **Every spec finding is primary.** The `scope_split` in your brief (primary /
  boy-scout) does not apply to this lens: a requirement is met or it is not, and
  "untouched code" is not a category here. Return no boy-scout block.
- **Every finding quotes the spec line verbatim** — the quoted text is the evidence,
  and the merge dedups on it. Placement: a `missing-requirement` has no code site, so
  it sits under a `### <spec path>` header (the path exactly as given to `--spec`) with
  the spec's own `L<lines>`; the other three sit under the code file they point at,
  with the code's `L<lines>`. The report skeleton is unchanged — every `###` header is
  still a file path.
- **Requirements met are one prose line, never findings.** Close your output with
  `N of M requirements met` (M counts the enumerated requirements the spec did not
  exclude); never list a met requirement in the finding shape.
- **Three channels.** A claim about runtime behaviour you cannot settle by reading (a
  timeout fires, a retry happens, an ordering holds under load) is `(verify)`; you
  never run the code. When you cannot tell whether a requirement is partly implemented
  or implemented wrong — the PARTIAL-vs-WRONG line — it goes to `CANDIDATES` with both
  readings stated, not into the findings on a coin flip. A craft problem noticed on
  the way (a duplicated branch, a mechanism name, a missing guard clause) is a
  `HANDOFF` to the lens that owns it; this lens grades conformance only.

#### How to state a finding

```
`spec` · rule · severity · L<lines> — "<quoted spec line>" <what is missing/wrong> → <what would close it>
```

One example per rule, in the report's own placement:

```
### docs/export-spec.md
- `spec` · missing-requirement · high · L14 — "The export includes a `created_at` column in ISO-8601." nothing in the diff writes the column and a Grep for `created_at` under `src/export/` finds no writer → add the column to `buildExportRow` in `src/export/rows.ts`

### src/export/rows.ts
- `spec` · wrong-implementation · high · L41 — "Amounts are rendered in the account's currency." `formatAmount` hard-codes `'USD'` → pass `account.currency` into `formatAmount`
- `spec` · partial-requirement · medium · L58–L63 — "Rows are sorted by date, then by id for ties." the comparator orders by date only → add the id tiebreak to the comparator
- `spec` · scope-creep · medium · L80–L96 — "The export is written as CSV." no line asks for compression, yet the diff adds a `--gzip` flag and a compression path → drop it, or land it as its own change with its own spec line
```

A `scope-creep` finding quotes the requirement the extra behaviour attaches to, then
says what no line asked for.

### `spec` family

#### `missing-requirement` — a spec line nothing in the diff implements

The spec promised a behaviour and the change does not deliver it. This is the finding
the user passed `--spec` to get, so enumerate before you read code — a requirement you
never listed is one you cannot notice missing.

- **Flag** an enumerated requirement with no `path:line` in the diff that implements
  it, after a Grep of the repo also finds nothing that already does.
- **Suggested fix**: name the function or file the behaviour belongs in, as a clause.
- **Calibration → not a finding**: a requirement the spec marks out of scope, deferred,
  or optional; one satisfied by code the diff did not need to touch (Grep before
  flagging); non-behavioural prose — motivation, background, a description of the
  current state. A requirement whose only evidence is runtime (a scheduled job that
  "runs nightly") is `(verify)`, not an assertion.

#### `wrong-implementation` — implemented, but contradicting the spec line

The requirement is addressed, and the code does something the spec line rules out — a
different value, a different condition, the opposite default. Worse than missing: the
change looks done.

- **Flag** a code site that maps to a requirement and contradicts it on a stated point
  — the status code, the limit, the currency, the condition under which the behaviour
  fires, the order of operations the spec fixes.
- **Suggested fix**: name the value, condition, or call that brings the site into line
  with the quoted spec text.
- **Calibration → not a finding**: a difference on a point the spec leaves open; an
  implementation stricter than the spec's stated minimum (validates more, rejects
  earlier); a naming difference with the same behaviour. If the site could equally be
  read as an incomplete implementation, it is the PARTIAL-vs-WRONG doubt —
  `CANDIDATES`, with both readings.

#### `partial-requirement` — a requirement only partly implemented

The requirement has several parts and the diff delivers some of them: the sort without
the tiebreak, the endpoint without its error branch, two of the three listed fields.

- **Flag** a requirement whose code site covers a subset of the behaviour the quoted
  line states, naming the missing part.
- **Suggested fix**: name the missing part and where it goes.
- **Calibration → not a finding**: a requirement the spec explicitly phases ("phase 2
  adds…"); a follow-up the diff names in a TODO the spec sanctions. A second part
  living in code the diff did not touch is met, not partial — Grep first.

#### `scope-creep` — behaviour in the diff no spec line asked for

The change ships behaviour the spec never mentioned: a new flag, an extra endpoint, a
side feature bolted onto the requirement. Unasked behaviour is unreviewed against any
intent, and it widens what the spec's author must now own.

- **Flag** an added behaviour — a user-visible option, a code path, a persisted field —
  that maps to no enumerated requirement, quoting the requirement it was attached to.
- **Suggested fix**: drop it, or split it into its own change with its own spec line.
- **Calibration → not a finding**: a refactor the requirement needs in order to land;
  tests, logging, or error handling around the requirement; a convention the project
  documents (the `<conventions>` note). Craft problems in the added code are
  `HANDOFF`, never a reason to raise this rule.

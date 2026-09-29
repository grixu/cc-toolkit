# Merge and report contract

How the Scanners' outputs become one review: the merge, which dedups, re-grades and reconciles,
then the report it renders. Two callers use it: `/start-cr` Steps 4–5, and the `cr-merge` skill. The
scope resolution, the conventions read and the lens set it refers to come from whoever prepared the
review — `/start-cr` Steps 1–2b, or `cr-prepare`.

Every path in this file is relative to the directory it sits in, the plugin's `references/`.

## Merge and re-grade


- **Collect** all N Scanners' outputs — every active lens's `<result>` actually in hand
  as the dispatcher collected it, not merely a notification that fired; a lens you could not collect is a
  labelled degradation you already surfaced to the user, never a silent gap in the merge.
- **Dedup overlaps**: when two findings point at the same code — including across
  different lenses, and across **all eleven families**, craft and `security` /
  `performance` / `spec` / `standards` alike — keep the **most-specific** one and drop
  the rest. When the overlap
  spans two severities (a `high` symptom folding into a lower-severity root cause, or the
  reverse), the surviving bullet keeps the **highest** severity of the overlap — deduping
  must never quietly demote a `high` under a `medium`.
- **Count the lenses that converged.** Independent Scanners landing on the same code
  is the strongest signal this review produces — they read the file separately and had
  no way to coordinate. Treat a finding several lenses reached (directly or via
  `HANDOFF`) as **confirmed**: it leads its file, and it is a candidate for the
  headline. Convergence raises confidence and ordering, **never severity** — that stays
  verbatim from the table.
- **Route every `HANDOFF` and every `CANDIDATES` entry to a visible home.** Assign a
  `HANDOFF` its correct family and rule; decide a candidate against its rule's
  calibration. Either way it lands in exactly one of two places: a graded bullet in the
  per-file report (on its own, or merged into a converging finding), or a `Not flagged`
  line with its one-line reason. **The entry no primary finding corroborates is the one
  that slips, so reconcile by an itemized check, not by assertion.** Before rendering,
  write the check out: enumerate every `HANDOFF` and every candidate you received, and
  against each name its home — the report bullet (`path:line`) it became, the converging
  finding it merged into, or the `Not flagged` line that clears it. An entry with no home
  on that list is a bug: route it before you render.
- **A primary finding is reconciled too.** The channels are not the only thing that goes
  missing: a Scanner's own `FINDINGS` entry can fall out of the merge between collecting and
  rendering, and nothing downstream notices. Count what you received per Scanner, and give every
  primary finding that does not reach a report bullet — deduped into another, demoted, or
  rejected — its own `Not flagged` entry with the reason. Dedup is the one silent case allowed,
  and only because the surviving bullet carries it.
- **Publish that check as one counted line above the report** — `Reconciliation: N
  handoffs + M candidates → A merged · B own bullet · C boy-scout · D Not flagged; P primary
  dropped` — where `A + B + C + D` equals `N + M`, and `P` counts the primary findings that got
  no bullet. The arithmetic is what makes the check real: a
  run that states "every handoff routed" without it has asserted rather than reconciled,
  and loses the entry nothing else corroborates. When the sums disagree, an entry is
  unrouted — find it, never adjust a number to close the gap.
- **Each count names the block it is counted in**, so the line can be checked against the report
  rather than believed: `merged` is an entry folded into another finding's bullet and visible in
  its text, `own bullet` one that became its own graded bullet under a file, `boy-scout` one
  rendered in the `Boy-scout` block, `Not flagged` one rendered as its own entry in `Not
  flagged`. Runs whose arithmetic was right have still printed `0 boy-scout` over a Boy-scout
  block holding three routed handoffs, and counted six entries as `merged` into a bullet that
  was never rendered. Before publishing, count the rendered blocks: `C` equals the Boy-scout
  entries that came from a channel, and `D + P` equals the entries in `Not flagged`. A count
  that does not match the block it names is the bug, not the block.
- **Resolve every `(verify)` finding**: read the code and confirm or refute it. A
  confirmed finding drops the marker and proceeds; a refuted one is a **Scanner false
  positive** — drop it and note it under `Not flagged`. An unresolved `(verify)` finding
  never reaches an apply batch. Most runs will have none — the Scanners resolve their own
  doubts. When no Scanner emitted one, say nothing about `(verify)` anywhere: do not
  claim to have resolved an empty list, and do not relabel some other mechanism as a
  `(verify)` — a routed `HANDOFF`, a decided candidate, or a refuted scanner doubt is
  resolved under its own name.
- **Re-grade every quality finding's severity yourself** against the master table in
  `severity.md` — read it now if you have not. It
  carries the 44 rows, what each severity means, the anti-anchoring rule, and the
  **`standards` keyword mapping** (MUST / MUST NOT / NEVER / ALWAYS → high, SHOULD →
  medium, MAY / prefer / consider → nit, no keyword → medium). A `standards` finding has
  no fixed row: re-grade it against that mapping by re-reading the rule it quotes, not
  the Scanner's guess. A single-lens Scanner is the one most prone to the anchoring that
  table forbids, so its severity is a first pass and yours is the one that ships.
- **Judge the fix, not only the finding.** A finding can be right and its fix wrong, and the apply
  phase is too late to notice: by then the user has approved it. For every fix that could reach a
  bucket, check three things against the code you already read:
  - **Does it keep behaviour?** Moving a guard onto a DTO turns a 400 into a 422; splitting a
    shared client drops the double-submit guard that shared instance provided; deleting an unused
    export removes what a later stage of the same spec consumes. A fix that changes what callers
    observe is not mechanical, whatever its rule says.
  - **Does it contradict another finding?** One review's headline fix bounded a payload *before*
    the redaction walk, which would have truncated secrets under the redactor's minimum length —
    a security hole introduced by a performance fix. Read the fixes as a set, not one at a time.
  - **Does it create the next finding?** An extraction that takes five positional parameters, a
    helper that duplicates one two files away — fix the fix before offering it.

  A fix that fails any of the three is re-routed: to the structural walk with the behaviour
  change named in its option, or to report-only with one line on why. Say which in the report's
  bullet rather than silently dropping the finding.
- **Comment verdicts are not re-graded** and are **not** mapped to severities. The
  two vocabularies stay side by side; there is no severity↔verdict mapping
  anywhere in a review.

## Report — one per-file skeleton, two vocabularies side by side


Group by **file**, not by Scanner. Under each file, list quality findings and
comment verdicts **together**. Render with **exactly this template**, in this
order — keep the structure identical between runs:

```markdown
Reconciliation: <N> handoffs + <M> candidates → <A> merged · <B> own bullet · <C> boy-scout · <D> Not flagged; <P> primary dropped

## Code review — <scope>

**Conventions:** <one line on what the conventions read picked up, or "none that change the verdict">
**Headline:** <one line — the single best or worst thing about the change>

### <path/to/file>
- `family` · rule · severity · L<lines> — <what the reader loses> → <the fix, as a clause>
- `comments` · R# · KEEP/REMOVE/REWRITE/MOVE/ADD · L<line> — <reason> → <fix>

### <path/to/another/file>
- `family` · rule · severity · L<lines> — <…>

**Not flagged:** <look-alikes deliberately passed on — one compact line, or a bullet
each when one is a real problem with no rule to land on; omit when empty>

**Boy-scout (untouched code, optional):**
- `family` · rule · <path>:L<lines> — <one line>

**Tally:** N quality findings (H high · M medium · K nit) · C comments (X remove · Y rewrite · Z move · V add · W keep) · F files. Lenses: L of 8 (skipped: <lens> — <reason>). Spec: R of T requirements met. Skipped: <files + reason>.
```

A filled-in report reads like this:

<example>
Reconciliation: 4 handoffs + 2 candidates → 3 merged · 1 own bullet · 0 boy-scout · 2 Not flagged; 0 primary dropped

## Code review — committed (base → HEAD), 3 files

**Conventions:** repo `CLAUDE.md` documents barrel exports as the public-API style, so `module` · barrel is not flagged here.
**Headline:** `checkout/total.ts` concatenates the request's coupon code into a raw SQL string at L72.

### src/checkout/total.ts
- `security` · injection-sink · high · L70, L72 — `couponCode` read from `req.query` at L70 reaches the raw `WHERE` string at L72 by concatenation → bind it as a query parameter
- `simplicity` · over-complex · high · L18, L34, L51 — three copies of the tier-discount branch drift independently → collapse into `discountFor(tier)` and call it at each site
- `readability` · magic-literal · medium · L22 — `0.1` carries the gold-tier rate with nothing naming it → name `GOLD_DISCOUNT_RATE`
- `comments` · R1 · REMOVE · L17 — "// multiply by the rate" restates the line beneath it → delete these lines

### src/checkout/receipt.ts
- `naming` · role-name · nit · L9 — `receiptArray` names the type instead of the role → `receipts`
- `comments` · R2 · ADD · L44 — the 250 ms retry gap is a gateway constraint no reader can infer → "// 250 ms — the gateway rejects retries closer than its own debounce window"

### docs/checkout-spec.md
- `spec` · missing-requirement · high · L14 — "A receipt lists the discount applied per line item" has no implementation in the diff → add the per-line discount to `Receipt`

**Not flagged:** `JSON.parse(raw) as Config` at L7 (boundary narrowing, not `needless-cast`); the exhaustive `default:` throw at L61 (defensive assertion, not `dead-code`).

**Tally:** 5 quality findings (3 high · 1 medium · 1 nit) · 8 comments (1 remove · 0 rewrite · 0 move · 1 add · 6 keep) · 3 files. Lenses: 8 of 8. Spec: 4 of 5 requirements met. Skipped: pnpm-lock.yaml (lockfile).
</example>

**The skeleton is the whole report.** It has no other sections: no `### Findings`
header, no numbered or bolded finding entries, no `---` rules between findings, no
per-finding code block, no closing summary. The `###` headers are **file paths** — one
per reviewed file, plus the **spec's own path** when `--spec` was given and a
`missing-requirement` needs a home — and each finding is a single markdown bullet
beneath its file. Do
not paste the code under review, the rewritten body, or a before/after block: a finding
that seems to need a code block is one whose fix is not yet stated as a clause, so state
it as a clause. Every report opens with `Conventions` and `Headline`, and closes with
`Tally`. The `Reconciliation` line is the only thing that precedes `## Code review` — it
belongs to the merge's check rather than to the report, which is why it carries counts and
not prose.

Rules for filling it in:

- **Two vocabularies, side by side.** Quality findings use `` `family` · rule ·
  severity ``, with the family **backticked** — one of the eleven fixed labels
  `readability`, `tests`, `naming`, `module`, `objects`, `patterns`, `simplicity`,
  `security`, `performance`, `spec`, `standards` — and rule and severity verbatim from
  `references/severity.md` (a `standards` rule is its slug, graded by the keyword
  mapping). Comment verdicts use `` `comments` · R# · KEEP/REMOVE/REWRITE/MOVE/ADD ``.
  **No severity↔verdict mapping** — keep them distinct.
- **Findings are markdown bullets** under a `###` file header (not inside a ```
  fence) so every `path:line` stays clickable. A `spec` · missing-requirement bullet
  sits under `### <spec path>` with the spec's own lines; every other spec finding sits
  under the code file it points at.
- **Order files** by their highest-severity quality finding; a REMOVE/REWRITE/MOVE/ADD
  comment weighs like a medium for ordering. Within a file: a `security` high first,
  then any **R9 (contradicts-the-code)** comment verdict, then high → medium → nit,
  then by line.
- **Collapse repeats**: one `family` · rule breaking in several spots is a single
  bullet with the lines listed together (`L20, L34, L51`).
- **The fix is a clause, not code.** "extract
  `transitionOrReportConflict(...)` and early-return at each site", "drop the `as
  User` cast", "name `SECONDS_PER_DAY`". Keep a rewritten body or a before/after
  block out of the report. For a comment REWRITE the fix is the exact replacement
  text; for MOVE, name the destination.
- **Quote comments verbatim.** Every comment verdict carries the verbatim comment
  text and its `path:line`.
- **`Not flagged`** lists the look-alikes deliberately passed on, plus every candidate,
  `HANDOFF` and dropped primary finding the merge cleared — one line when they are all genuine
  non-findings, a short bullet each when one of them is a *real* problem that merely has no rule
  to land on. **Its entries stay countable**: separated by `;` on the one-line form, one bullet
  each otherwise, because the `Reconciliation` line's last two numbers are checked against them. A real problem keeps its own bullet rather than being compressed into a
  subordinate clause; that compression is how something worth acting on disappears. Drop
  the block if empty.
- **`Boy-scout`** holds only findings in code the change did not touch; omit the
  whole block when there are none.
- **Resolved findings only.** The body lists confirmed findings; a refuted one goes in
  `Not flagged` as a Scanner false positive.
- **The headline may not contradict the combined tally.** If there is any quality
  `high` or `medium` finding, **or** any comment REMOVE / REWRITE / MOVE / ADD, the
  headline names the worst one — it must not call the change "clean",
  "well-structured", or "only cosmetic nits". A confirmed **`security`** finding is the
  headline over any craft finding, whatever their severities — and so is a confirmed
  **exposure that no rule names**, which leads the report from its own `Not flagged`
  bullet rather than being demoted for want of a tag; a `spec` ·
  missing-requirement or wrong-implementation forbids the clean headline outright.
  Reserve the clean verdict for a tally that is genuinely nits-only-and-all-KEEP (or
  empty).
- **The `Tally` names the lenses.** `Lenses: L of 8` always, with each skipped Lens
  and its lens-set reason in the parenthesis (`skipped: performance — no executable
  code; spec — no spec named`); drop the parenthesis when all eight ran. When a spec was
  given, add the `spec` Scanner's met-requirements count as `Spec: R of T requirements
  met`; omit that clause otherwise.

Collapse the whole report to the title line plus a one-sentence verdict and the
tally **only when the change reads cleanly** — the quality tally is empty or
nits-only and every comment is KEEP, and no `spec` · missing-requirement or
wrong-implementation stands. Match the report to what you found: neither pad
a clean one to look thorough, nor collapse one carrying a medium-or-higher finding, a
spec gap, or a REMOVE/REWRITE/MOVE/ADD to look clean.

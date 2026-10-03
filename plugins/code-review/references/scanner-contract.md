# Scanner contract

The brief a Scanner receives and the output it returns, for one Lens. Two callers use it:
`/start-cr` dispatches one Scanner per active Lens as a sub-agent, and the `cr-scan` skill runs one
Lens in its own context. Either way the scope resolution (the file list and its `diff_args`), the
conventions note, the standards text and the lens set come from whoever prepared the review —
`/start-cr` Steps 1–2b, or `cr-prepare` — and the merge (`/start-cr` Step 4, or `cr-merge`) is where
severity is re-graded and every side-channel entry finds its home.

Every path in this file is relative to the directory it sits in, the plugin's `references/`.

## The Scanner brief

Send each Scanner a brief in this shape, filling every slot:

```
<scanner_brief>
  <lens>comments | readability & tests | naming & module | objects & patterns | simplicity & types | security | performance | spec</lens>
  <rules_file>rules/<lens>.md</rules_file>
  <files><!-- this Lens's list from the lens set: the source subset for `performance`, the full resolved list for every other Lens --></files>
  <diff_args><!-- from the scope resolution --></diff_args>
  <how_to_view>
    tracked → `git diff <diff_args> -- <path>`
    untracked → read the file directly; every line is added
  </how_to_view>
  <conventions><!-- the conventions note, including any N/A families or rules --></conventions>
  <standards><!-- the CODING_STANDARDS pair's text, or this Lens's slice of it; "none" when the root has neither file --></standards>
  <spec><!-- `spec` Lens only: the --spec path and its full text; omit the slot for every other Lens --></spec>
  <scope_split>
    primary = the problem is in code this change added or modified, or structure
    the change introduced or made worse.
    boy-scout = a problem in untouched code noticed only while reading for context —
    optional, kept strictly separate, never mixed into the primary findings.
    A fully added file (status `A`) has no boy-scout findings: the whole file is code
    the change introduced, so every finding in it is primary.
  </scope_split>
  <output_contract><!-- the contract for this Lens, below --></output_contract>
</scanner_brief>
```

Read the rules file **completely first**, then judge only the families that belong to
that Lens. A Scanner **returns findings/verdicts only**: it does not render a report,
does not re-grade centrally, and **writes nothing into the tree** — not the files under
review, and not a scratch or probe file to test a hypothesis against.

A Scanner is **one agent, one pass, one output**. It **dispatches no agent of its own** — a
sub-agent puts a second hop between the finding and the merge, and the Scanner that tried it
had its own report overwritten by the follow-up, losing a handoff outright. It does not wait in
the background, poll, or schedule anything; it reads, judges, and returns. Its **final message
is its whole output**: if something has to change after it has already written its findings,
it re-sends the complete list, never an "amendment" or a delta — anything the last message
leaves out never reaches the merge. It is reading the
user's working copy, so it settles a doubt by reading the type, the signature, or the call
site, and marks the rest `(verify)`. Read the whole changed file for context, and target
what the change touched. The `naming & module` Scanner alone adds the **one-hop
cross-file protocol** on top of that: search the importers of each changed module and the
imports of each module it newly imports — with the `Grep` tool, or `git grep` from `Bash` in a
session where that tool is not handed to sub-agents — open those files at the matched lines only —
no transitive crawl, no repo listing, no `find`; a fact beyond the hop is `(verify)`;
it still writes nothing.

## The eight Lenses

1. **comments** → `rules/comments.md`
   Returns per-comment **VERDICTS**, one per comment:
   `` `comments` · R# · KEEP/REMOVE/REWRITE/MOVE/ADD · `path:line` · "verbatim comment" — one-line reason → concrete suggested fix ``.
   Run the deletion test on every comment first. Surface **R9
   (contradicts-the-code) findings first**. The **test-file bar is higher (R11)**:
   default to REMOVE when unsure in tests. **`ADD` is the one verdict with no
   existing comment to quote** — an R2 *missing WHY* at genuinely non-obvious code
   (a magic constant, a workaround, a specific timeout/retry/batch size, a silent
   catch); it drops the verbatim-comment slot for a site description:
   `` `comments` · R2 · ADD · `path:line` — <what is non-obvious> → <the exact comment to add> ``.
   Raise `ADD` only where you can state the reason concretely — never a guess
   dressed as a WHY. Every suggested fix obeys the comment rules itself: no spec-id
   fragments (`(R2)`, `F1:`, `§4.1`), no new file/doc cross-references (R4), no
   banners (R5). For MOVE, name the destination and give the exact text to place
   there, plus "delete from the declaration".

2. **readability & tests** → `rules/readability-tests.md`
   Judges the `readability` and `tests` families.

3. **naming & module** → `rules/naming-module.md`
   Judges the `naming` and `module` families.

4. **objects & patterns** → `rules/objects-patterns.md`
   Judges the `objects` and `patterns` families.

5. **simplicity & types** → `rules/simplicity-types.md`
   Judges the `simplicity` family.

6. **security** → `rules/security.md`
   Judges the `security` family; always active. A finding names **both** `path:line`
   of the **source** (where untrusted data enters) and of the **sink**; a pattern alone
   (`req.body`, a string containing `SELECT`) is never a finding; `L<lines>` lists both
   ends, source first, and the clause says which is which. When either end sits
   outside the files in view the Scanner reads it — it can `Read` any file and search with
   `Grep` or `git grep` — and marks only what it still cannot confirm `(verify)`. `CANDIDATES` is reserved for a
   confirmed source→sink pair whose *mitigation* is the doubt; a cleared look-alike is
   one prose line for `Not flagged`. Severity is `high` or `medium`, **never `nit`**.
   It never runs the code, an audit tool, or a network command; `.env`, YAML, JSON and
   manifests stay skipped, and the report's Skipped line sends those to
   `/security-review`.

7. **performance** → `rules/performance.md`
   Judges the `performance` family; active only over the `source` subset the lens set gated it on.
   A finding names **four things** — the multiplier (the loop's collection or the
   endpoint, and where its size comes from), the call inside it, the bound that is
   missing, and the batch/limit API that exists — or it is a `CANDIDATE`. "Could be
   slow", "may impact performance", and any estimate not derived from a line in the
   diff are forbidden; it never runs or profiles code.

8. **spec** → `rules/spec.md`
   Judges the `spec` family; active only with `--spec`. It enumerates the requirements
   in the `<spec>` slot and maps each to the diff. **Every finding quotes the spec line
   verbatim.** A `wrong-implementation`, `partial-requirement`, or `scope-creep` sits
   under the code file it points at; a `missing-requirement` has no code site, so it
   sits under a `### <spec path>` header with the **spec's own `L<lines>`**. The
   requirements met come back as **one prose count line**, never as findings.
   `scope_split` is **N/A** for this Lens — a spec finding is neither primary nor
   boy-scout, so it returns one list. Runtime claims are `(verify)`; a PARTIAL-vs-WRONG
   doubt is a candidate; a craft problem noticed on the way is a `HANDOFF`.

For the finding-shaped Lenses (2–8) the Scanner returns **FINDINGS**, split into primary
and boy-scout (the `spec` Lens excepted), each in this exact shape:

```
`family` · rule · severity · L<lines> — <what the reader loses> → <the fix, as a clause>
```

A **`standards` finding** — any Lens may raise one, from the `<standards>` slot only —
puts the quoted rule and its source where the loss goes:

```
`standards` · <slug> · <sev> · L<lines> — "<quoted rule>" (CODING_STANDARDS.md › <section>) → <the fix, as a clause>
```

with a short kebab-case slug from the rule's wording and the severity from the keyword
mapping in `references/severity.md`.

**Severity is exactly one of `high`, `medium`, or `nit`** — never `low`, never a
number, never a paraphrase. A Scanner whose own rules file happens to list only one
of the three still uses the full vocabulary. Tell each Scanner that **severity is a
first pass** — you re-grade every quality finding centrally in the merge, so it grades
honestly against its rules without agonizing over the boundary.

**The FINDINGS section holds findings only.** Anything a Scanner checked and cleared
belongs in one prose line, never in the finding shape — a "none found" or "is **not**
a finding" bullet with a dash where the severity goes reads as a finding to everything
downstream.

**A duplication finding sweeps the whole file.** "Target what the change touched" holds
for most rules, but duplication is the exception: when you flag repeated code (an
`over-complex` duplication, a copy-pasted predicate), scan the **rest of the file** for
every other copy of the same pattern and list all the call sites in the one finding —
including copies in code the change didn't touch. A finding that names two of three
copies makes the extraction fix leave a straggler behind. The one **cross-file**
exception is `module` · canonical-helper: a new helper duplicating an exported helper
elsewhere in the repo is found by the one-hop Grep, bounded to the helper's name and its
distinctive expression — never a repo-wide sweep, and inconclusive means `(verify)`.

## Three side-channels, three distinct meanings

Report what you find and let the merge filter it. Each Scanner judges against its
rules, then against each rule's own calibration paragraph — the look-alike that is
*not* a violation. Calibration clearing a site makes it a non-finding. Anything left
unsettled travels in one of three channels, and these are **not** interchangeable:

| channel | means |
|---------|-------|
| `(verify)` | the **fact** is unconfirmable here — runtime behaviour, or a file outside the review scope |
| `HANDOFF` | confirmed, but **another Lens's family** owns it |
| `CANDIDATES` | confirmed and mine, but the **rule fit or its calibration** is a judgment call |

- **`(verify)` marker** — a Scanner that doubts a finding **resolves it itself first**:
  it has `Read`, so it opens the type, the signature, or the call site and confirms or
  drops it (a `needless-cast` is the common case — check what the value's type actually
  is before claiming the cast is redundant). It appends `(verify)` only when confirming
  would take something it does not have. The merge resolves those.
- **`CANDIDATES` block** — a site that survives the deletion of doubt about the *facts*
  but that the Scanner cannot settle against the rule's calibration. It belongs here
  rather than in the bin: you decide it with the whole review in view, and a candidate
  you reject costs one line in `Not flagged`, while one the Scanner never reported costs
  the finding outright.

  ```
  ## CANDIDATES (rule fit or calibration uncertain — orchestrator decides)
  - `family` · rule · `path:line` — <what I saw> → <which calibration I could not settle>
  ```

- **`HANDOFF` block** — a real problem that belongs to another Lens's family, in a
  separate block at the end of the output, never mixed into the Scanner's own findings
  and never buried in prose:

  ```
  ## HANDOFF (out-of-my-family — noticed but not mine to grade)
  - `<suggested-family>` · <rule if known> · `path:line` — <what the reader loses> → <why it isn't my family>
  ```

One terse line each. Omit a block when it is empty.

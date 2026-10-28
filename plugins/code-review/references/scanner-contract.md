# Scanner contract

The brief a Scanner receives and the output it returns, for one Lens. The `cr-scan` skill is the
Scanner: it assembles this brief from a context directory and runs one Lens, or a caller's list of
Lenses one after another, each as its own Scanner. `/start-cr` and the headless workflows both
dispatch it, as the `code-review:scanner` agent. Either way the scope resolution (the file list and its `diff_args`), the
conventions note, the standards text and the lens set come from whoever prepared the review —
`/start-cr` Steps 1–2b, or `cr-prepare` — and the merge (`/start-cr` Step 4, or `cr-merge`) is where
severity is re-graded and every side-channel entry finds its home.

Every path in this file is relative to the directory it sits in, the plugin's `references/`.

## The Scanner brief

Send each Scanner a brief in this shape, filling every slot:

```
<scanner_brief>
  <lens>comments | readability & tests | naming & module | objects & patterns | simplicity & types | security | performance | spec | correctness | coherence</lens>
  <rules_file>rules/<lens>.md</rules_file>
  <files><!-- this Lens's list from the lens set: the source subset for `performance`, the full resolved list for `security`, the full resolved list plus every skipped file for `spec`, the full resolved list plus every skipped file except lockfiles and generated output, minus the active spec, for `coherence`, the resolved list minus `policy` files for every other Lens --></files>
  <diff_args><!-- from the scope resolution; "none" when the user named paths --></diff_args>
  <how_to_view>
    diff_args "none" → read the file whole; every line is under review
    tracked → `git diff <diff_args> -- <path>`
    untracked → read the file directly; every line is added
  </how_to_view>
  <conventions><!-- the conventions note, including any N/A families or rules --></conventions>
  <standards><!-- the CODING_STANDARDS pair's text, or this Lens's slice of it; "none" when the root has neither file --></standards>
  <spec><!-- `spec` and `correctness` Lenses: the --spec path and its full text, plus the spec-focus codes when the caller recorded any; `coherence`: the --spec path alone, so it leaves that file to `spec`; omit the slot for every other Lens, and for these three when no spec is active --></spec>
  <scope_split>
    primary = the problem is in code this change added or modified, or structure
    the change introduced or made worse.
    boy-scout = a problem in untouched code noticed only while reading for context —
    optional, kept strictly separate, never mixed into the primary findings.
    A fully added file (status `A`) has no boy-scout findings: the whole file is code
    the change introduced, so every finding in it is primary.
    With diff_args "none" there is no change to measure against: every file is under
    review whole, and every finding is primary.
  </scope_split>
  <output_contract><!-- the contract for this Lens, below --></output_contract>
</scanner_brief>
```

Read the rules file **completely first**, then judge only the families that belong to
that Lens. A Scanner **returns findings/verdicts only**: it does not render a report,
does not re-grade centrally, and **writes nothing** — not the files under review, and no
scratch or probe file to test a hypothesis against, inside the checkout or anywhere else. The
one file `cr-scan` writes is its output, the headless form of this return.

Every Scanner's output opens with one header line, `Lens: <lens> · files judged: <N> of <M>`,
where `M` is the length of its `<files>` and a file counts as judged once its change was read. A
Scanner that judged none of its files says so there; the merge never reads a findings-free
output without that line as a clean lens.

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

## The Lenses

1. **comments** → `rules/comments.md`
   Returns per-comment **VERDICTS**, one bullet per comment it acts on:
   `` `comments` · R# · REMOVE/REWRITE/MOVE/ADD · `path:line` · "verbatim comment" — one-line reason → concrete suggested fix ``.
   Every comment it judged and kept is counted, not listed: one line, `KEEP: <W> comments
   across <F> files`, after the verdicts. A KEEP that needs a reason — a comment a reader
   would expect to see flagged — is the one exception, and goes to `Not flagged` in prose.
   Run the deletion test on every comment first. Surface **R9
   (contradicts-the-code) findings first**. The **test-file bar is higher (R11)**:
   default to REMOVE when unsure in tests. **`ADD` is the one verdict with no
   existing comment to quote** — an R2 *missing WHY* at genuinely non-obvious code
   (a magic constant, a workaround, a specific timeout/retry/batch size, a silent
   catch); it drops the verbatim-comment slot for a site description:
   `` `comments` · R2 · ADD · `path:line` — <what is non-obvious> → <the exact comment to add> ``.
   Raise `ADD` only where you can state the reason concretely — never a guess
   dressed as a WHY. Every suggested fix obeys **all** the comment rules itself, judged
   by the same deletion test as the comment it replaces: it restates nothing the code
   says (R1), stays one load-bearing sentence (R3), matches what the code actually does
   (R9 — check every claim the replacement keeps against the code, not only the clause you
   changed), and carries no spec-id fragments (`(R2)`, `F1:`, `§4.1`), no new file/doc
   cross-references (R4), no banners (R5). It fits the file's print width — the formatter
   config's, else the width the file's other comments wrap at — and comes as several lines
   when one does not hold it: a formatter does not rewrap comments. A replacement you would
   flag yourself is not a fix. For MOVE, name the destination and give the exact text to place
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
   It never runs the code, an audit tool, or a network command. It alone judges the
   `policy` files — access policies, RBAC, `CODEOWNERS`, CI workflows — for widening and
   exposure; `.env`, other YAML and JSON, and manifests stay skipped, and the report's
   Skipped line sends those to `/security-review`.

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
   carries the **spec's own path and `L<lines>`**. The
   requirements met come back as **one prose count line**, never as findings.
   `scope_split` is **N/A** for this Lens — a spec finding is neither primary nor
   boy-scout, so it returns one list. Runtime claims are `(verify)`; a PARTIAL-vs-WRONG
   doubt is a candidate; a craft problem noticed on the way is a `HANDOFF`.

9. **correctness** → `rules/correctness.md`
   Judges the `correctness` family; always active. It asks whether the changed code does
   what it evidently means to do, and a finding names **the input or state that takes the
   wrong path and the wrong result it gets** — "might not handle edge cases" is never a
   finding. Intent comes from the code's names, callers, tests and types; where the `<spec>`
   slot is filled and the behaviour departs from a spec line, that is a `spec` ·
   wrong-implementation `HANDOFF`. Severity is `high` or `medium`, **never `nit`**. It never
   runs the code; a fact that needs a run is `(verify)`.

10. **coherence** → `rules/coherence.md`
    Judges the `coherence` family; always active. A finding cites **two sides** —
    `pathA:L` vs `pathB:L`, each quoted or given by its exact value — and what breaks between
    them; severity is `high` or `medium`, **never `nit`**.

For the finding-shaped Lenses (every Lens but `comments`) the Scanner returns **FINDINGS**,
split into primary and boy-scout (the `spec` Lens excepted), each in this exact shape:

```
`family` · rule · severity · `path:L<lines>` — <what the reader loses> → <the fix, as a clause>
```

Every finding names its own file: the merge regroups findings by file, and a bare `L<lines>`
under a Scanner's own heading loses its file the moment it is moved. `path` is relative to the
checkout, exactly as `<files>` lists it.

A **`standards` finding** — any Lens may raise one, from the `<standards>` slot only —
puts the quoted rule and its source where the loss goes:

```
`standards` · <slug> · <sev> · `path:L<lines>` — "<quoted rule>" (CODING_STANDARDS.md › <section>) → <the fix, as a clause>
```

with a short kebab-case slug from the rule's wording and the severity from the keyword
mapping in `references/severity.md`.

**Severity is exactly one of `high`, `medium`, or `nit`** — never `low`, never a
number, never a paraphrase — and it is the one `severity.md` gives the rule's row. The
vocabulary is shared; the grade is not free: a `security`, `spec`, `correctness` or
`coherence` finding is never `nit`, and a doubt about its grade goes to `CANDIDATES`, never to a softer severity. Tell each Scanner that **severity is a
first pass** — you re-grade every quality finding centrally in the merge, so it grades
honestly against its rules without agonizing over the boundary.

**A name a fix proposes is held to the naming rules.** Every name a suggested fix introduces —
a rename, an extracted helper, a new constant — passes `naming` · intent-name and role-name
itself and reuses no name the module already exports. A name you would flag yourself is not a
fix, and the next review round flags it.

**The FINDINGS section holds findings only.** Anything a Scanner checked and cleared
belongs in one prose line, never in the finding shape — a "none found" or "is **not**
a finding" bullet with a dash where the severity goes reads as a finding to everything
downstream.

**A duplication finding sweeps the whole file.** "Target what the change touched" holds
for most rules, but duplication is the exception: when you flag repeated code (an
`over-complex` duplication, a copy-pasted predicate), scan the **rest of the file** for
every other copy of the same pattern and list all the call sites in the one finding —
including copies in code the change didn't touch. A finding that names two of three
copies makes the extraction fix leave a straggler behind. The same holds for any finding
whose fix is a **single move** — one import re-pointed, one constant relocated: it is one
finding listing every site the move fixes, never a bullet per importer. The one **cross-file**
exception is `module` · canonical-helper: a new helper duplicating an exported helper
elsewhere in the repo is found by the one-hop Grep, bounded to the helper's name and its
distinctive expression — never a repo-wide sweep, and inconclusive means `(verify)`.

**A fix round is judged as it stands, never undone.** When the change under review is a
review's own fix round — the caller says so, or the commits name the findings they fix — the
edits that round made are what the previous review asked for. Judge them like any code, but
never raise a finding whose fix reverses one (renaming back, inlining what was just
extracted, restoring a removed comment): two rounds that disagree only flip the code back and
forth. A fix that is itself wrong is a finding on what it broke, not on the edit's direction.
A comment the fix round wrote is re-judged for R9 and print width only; a taste-level R1 or R3
on it goes to `CANDIDATES`, where the merge clears it. A candidate the previous round's merge
cleared is not raised again unless this change moved the code further from its rule.

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
  - `<family>` · <rule> · `path:line` — <what the reader loses> → <why it isn't my family>
  ```

  The family is one of the fixed labels in `severity.md` and the rule one of that family's
  rows, or `comments` with its `R#` — never a label made up for the occasion (`types`,
  `logic`, `error-handling`). A wrong condition, an unhandled case or a swallowed error is
  `correctness`. Where two families touch the same code, the owner is fixed:

  - two declarations of one boundary that the type checker connects → `correctness` ·
    contract-mismatch; that it does not connect (YAML, proto or SDL vs code, a hand-copied
    type, a separate service) → `coherence` · contract-drift;
  - comment text inside a source file → `comments` R9; any non-comment artifact →
    `coherence` · doc-drift;
  - the active spec vs the code → `spec` · wrong-implementation; every other document vs
    the code → `coherence`;
  - import arrows → `module` · dependency-direction and a `CODING_STANDARDS` rule →
    `standards`, even when an ADR states them; any other invariant a decision document
    states → `coherence` · invariant-breach;
  - wider trust, an exposed secret, or a missing or weaker authorization check → `security`
    (`iac-exposure`, `access-widening`, `missing-access-check`); a broken deploy or a name
    mismatch between artifacts → `coherence` (`config-drift`, `sibling-asymmetry`);
  - a setup/teardown pair inside one function → `patterns` · execute-around; a paired
    operation missing across units → `coherence` · missing-counterpart.

  A problem you are sure of that fits no row is still not a new family: send it
  with the nearest family and say in the clause which row it misses, and the merge decides it.

One terse line each. Omit a block when it is empty.

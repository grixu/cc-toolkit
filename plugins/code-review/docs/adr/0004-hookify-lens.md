# A gated hookify lens replays the project's hookify rules over the diff

Status: accepted

Amends 0003's lens set and counts. A twelfth lens, `hookify`, judges the change against the
checkout's own hookify rule files, with its own rules file (`references/rules/hookify.md`) and
scanner. Like `standards`, the `hookify` family has no fixed rows: a finding's rule is the
hookify rule's `name`, verbatim, and the finding quotes the sentence of the rule's message the
change breaks and names the rule file. Thirteen families stay fixed; `standards` and `hookify`
are the two repo-defined labels.

**The review moved here from the hookify plugin.** Hookify shipped a `review-changes` skill
that partitioned a diff by rule, fanned out its own subagents and wrote its own report with
its own follow-up. That gave a project two reviews of one change, two reports, and two fix
flows that did not know about each other. Hookify and the lens now split the work by when it
runs:

- **hookify enforces at edit time.** Its hooks check every Edit and Write while Claude works,
  and warn or deny the call.
- **the lens replays the same rules over a diff.** Code that reached a commit without the hooks
  running met no rule: it was written by hand, by another tool, in a session without the
  plugin, or past a `warn` someone ignored. The lens checks each hunk the way the hooks would
  have checked that edit, so a `hookify` finding is merged, deduped and re-graded with every
  other finding and lands in the one report and the one apply menu.

The lens follows hookify's runtime semantics rather than a reading of its intent: hookify's own
frontmatter parser, `.local.md` before `.rule.md` with the first claim of a `name` winning (a
disabled rule still claims it), `pattern` as shorthand for one `regex_match` condition,
`file_path` as the absolute path Claude Code sends, and a hunk's added and removed lines as
`new_text` and `old_text`. A rule that only a command, a prompt or a transcript can settle is
set aside with a prose line.

**The gate.** `hookify` is active iff the checkout's own `.claude/` holds
`hookify.*.local.md` or `hookify.*.rule.md` files and at least one of them has an `enabled:`
line that is not `false` and an `event:` line that is `file`, `all` or absent. The gate reads
those two lines and nothing more; which rules apply is the lens's to settle. Every file found
is handed to the lens in load order, disabled ones included, because a disabled `.local.md`
switches off the team rule of the same name. `~/.claude/` rules are never read: they are one
person's rules for every project, and a review of the project should not change with who runs
it.

**Severity comes from the rule's `action`.** `block` grades `high`; `warn`, or no `action`,
grades `medium`. Never `nit`: a rule the project wrote down is not cheap to break. The author
already chose how hard the rule bites when they picked `action`, so the review does not grade
it a second time from the code.

## Considered Options

- **Keep `review-changes` in hookify** — rejected: a second report with its own fix flow, its
  own fan-out, and no dedup against `security` or `standards` findings on the same line.
- **Fold hookify rules into `standards`** — rejected: a `CODING_STANDARDS.md` rule is prose the
  scanner reads for meaning, while a hookify rule is a regex with defined fields and operators.
  Mixing them would put the replay discipline into every scanner's standards slice.
- **Read `~/.claude/` rules too, as the old skill did** — rejected: the same branch would review
  differently on two machines.
- **Grade from the code, like a fixed family** — rejected: it would second-guess the author's
  `action`, and the rule files carry no row to grade against.

## Consequences

- Twelve lenses, nine of them always on; a change with executable source, a named spec and
  hookify rules runs twelve scanners, and the tally reads `L of 12`.
- **A worktree sees only committed rule files.** The gate Globs the checkout under review, and
  hookify's README says not to commit `.local.md` files. A `--pr` review in a detached worktree,
  or a task worktree, therefore applies the team's `.rule.md` files without the reviewer's
  local overrides, while a review in the primary checkout applies both. A local `enabled: false`
  override does not carry into a worktree.
- **Lockfiles, generated output and real `.env*` files are never given to the lens.** Its
  `<files>` is `coherence`'s list with the active spec kept, so a rule aimed at
  `package-lock.json`, `dist/` or `.env` never fires in review, even though hookify would fire on
  an edit to them. A rule whose `file_path` targets a real env file is set aside with a prose
  line.
- **No per-rule severity.** Two `warn` rules both grade `medium`, however different their
  stakes; the only lever is `action`, and `block` also denies the edit at runtime.
- A path-only rule says only that a file changed, so it is raised only when the added lines do
  what its message warns against. A match inside a comment, a documenting string, a fixture or
  a test asserting the call is absent is a `CANDIDATE`: hookify would have fired, and whether
  the rule means it is the merge's call.
- A doubtful regex is settled by running it with `python3 -c` `re.search`, the one command the
  lens runs.
- Eval-43 (recall) and eval-44 (calibration) cover the lens.

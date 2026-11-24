# The comments lens sorts comments into four kinds, and keeps local reasons inline

Status: accepted

Matt Pocock's comment-audit prompt (x.com/mattpocockuk/status/2123798388227403983, 2026-11-20)
sorts every comment into four kinds and treats comments as harmful: a **tautology** repeats the
code, a **stale** comment describes code that is gone, an **excuse** licenses a hacky
implementation, and a **decision record** belongs in an ADR. The `comments` lens already caught
tautologies (R1, R7, R11) and part of staleness (R9 contradiction, R6 history). It had no rule for
an excuse, and R6 kept an open `TODO: do this properly` as a landmine.

**Triage first.** The rules file now opens with the four kinds, each pointing at the rules that
judge it, so a scanner names the kind before it picks a rule.

**Stale is part of R9.** A comment that names a function, flag or approach the code no longer has
is R9's, with the same evidence bar: the name is grepped before the claim.

**An excuse is flagged, not deleted (R13).** The prompt deletes the comment and files an issue for
the hack. Here the comment stays and the finding is a report-only REWRITE that names the proper fix
or the constraint the comment should state. Deleting an excuse hides the shortcut and leaves the code
as it is, and filing issues is an outward action a review does not take on its own. R6 now keeps
only a `TODO` with an external, checkable trigger.

**Only a cross-cutting decision moves to an ADR (R14).** The prompt moves every decision record.
Here a local *why* (a limit, an ordering, a workaround's cause) stays inline under R2, because
the reader of that code is the one who needs it. A comment that records a choice between
alternatives, or a rule other code must follow, becomes a MOVE into a new ADR, and only when the
repository already keeps an ADR directory: the lens does not introduce ADRs to a repository that
has none.

**Left out.** The prompt's lint rule banning comments with a ratchet, the repo-wide sweep and the
estimate of deleted lines are not part of a diff review; the lens judges the comments a change
touches.

The verdict set is unchanged (KEEP, REMOVE, REWRITE, MOVE, ADD), so the report shape, the tally
and the eval checks that parse comment bullets did not change.

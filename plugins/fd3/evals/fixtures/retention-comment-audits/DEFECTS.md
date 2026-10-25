# retention-comment-audits — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
Used by grill-verified-claims. Shape taken (anonymised) from a real grill that presented a Terraform
comment as a code fact and then had to correct three questions.

## The planted trap: a comment that contradicts the code

- `infra/results.tf:13-14` — the comment `# Partitions expire after 31 days: reads only look back 30
  days, so nothing older is ever queried.` above `expiration_ms = 2678400000` (31 days, line 15).
- `src/store.ts:14-27` — `getAuditResult`, the only read: it selects by `id` with `created_at`
  between one day before and one day after the `createdAt` the caller passes. No 30-day window
  exists anywhere in `src/`.
- `src/routes/report.ts:4-10` — `openReport` passes the link's own `id` and `at`, so a report of
  any age is read, and answers 404 once its partition has expired.
- `src/audit.ts:9` — the link a report carries holds its id and creation time.

The comment's claim is false: reads do reach results older than 30 days, through every old link.
A round that repeats the 30-day claim without the read path beside it (`src/store.ts` or
`getAuditResult` in the same paragraph) fails. The check reads the `QUERY_LINES` range (14-27):
a `store.ts:N` citation outside it fails.

## No other defect

`saveAuditResult` (`src/store.ts:29-34`) destructures `createdAt` out of the row and inserts it as
`created_at`, so every field it sends is a column of `infra/audit_results.schema.json`. Spreading the
whole result sent the non-column `createdAt` as well — a real insert bug every trial found instead of
the planted trap. Keep the insert column-exact, and keep the read query at lines 14-27.

## The option the facts point to

Changing the partition expiry: dropping it (or keeping results indefinitely), the option the real
grill left out of its first question, or raising it, since `src/routes/report.ts:3` says links stay in
customers' inboxes for months. The check requires an option or finding that names either. A round
whose options leave the expiry alone (a clearer 404, a time-travel restore, monthly re-runs) fails.

## Topic

`notes/topic.md` makes no claim about the read window, so nothing in it legitimises the 30-day
claim; the comment is the only source of it.

It also states that the live table matches Terraform and gives its size. The size is one month of
audits, since the 31-day expiry keeps no more, and the 1.3 GB is growth in that monthly volume; a
"40 GB growing 1.3 GB a month" reading as accumulation contradicts the expiry. The sandbox denies
`gcloud`, and without those facts runs held the fix-and-retention question back on an access
request, so the expiry option never appeared; a user would answer both from what they know.

## Scenario settings

The scenario disallows `AskUserQuestion`, so round 1 is posted as text and the run ends on it:
the final message is round 1 with its findings.

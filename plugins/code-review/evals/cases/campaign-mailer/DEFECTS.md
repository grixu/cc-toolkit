# Planted findings — campaign-mailer

`reset-sandbox.sh` builds `.sandbox/mailer` from this directory: `base/` is the commit on `main`,
`head/` the files two commits on `feat/weekly-digest` add or change, and `lenses/` the lens files
the ten active Scanners would have written into `.sandbox/mailer-ctx`. Neither this file nor
`lenses/` reaches the checkout. The anonymised shape comes from a real run where a mailer's
missing visible unsubscribe link had no rule, sat in `Not flagged`, and never reached the menu.

## What each apply bucket holds

The lens files carry exactly these, with the line numbers below. Each fix stays inside one file,
and each file belongs to one family, so a commit's files tell its family.

| bucket | finding | file:lines | family |
|---|---|---|---|
| rule-less, own option | `renderDigest` receives `unsubscribe_url`, puts it only in the `List-Unsubscribe` header, and its footer renders no link (`newsletter.ts:L10` does; the README requires one) — on the correctness lens's `Not flagged` line | `src/templates/digest.ts:L7, L15-L16` | `correctness` |
| Safe | comments R1 REMOVE `// return the send time when it is still in the future, otherwise now` | `src/campaigns/schedule.ts:L4` | `comments` |
| Safe | `readability` · magic-literal · medium, `500` per-call cap | `src/campaigns/throttle.ts:L2` | `readability` |
| structural | `simplicity` · over-complex · high, the opt-out/bounce/locale filter twice | `src/campaigns/recipients.ts:L3-L11, L13-L21` | `simplicity` |
| structural | `objects` · leaky-collection · high, `entries` returns the private array | `src/campaigns/sender.ts:L12-L14` | `objects` |
| boy-scout | `naming` · role-name · nit, `sizeMap` in untouched `segmentSizes` | `src/campaigns/audience.ts:L4, L7, L10` | `naming` |

With `Report only` always offered, the candidates need five options and the menu has four, so the
priority order in `start-cr.md` Step 6 (a rule-less correctness problem before the canonical
buckets, `Boy-scout extras` last) leaves the boy-scout nit out.

## Look-alikes the lens files clear

- `escapeHtml` on every interpolated value in `digest.ts`: not an `injection-sink`.
- `Pick<CampaignEmailInput, 'title' | 'unsubscribe_url'>`: a real narrowing, not a `needless-cast`.
- `SendLog.has` over an in-process array and `largestSegment`'s in-memory sort: no performance bound.

## Around the review

- `scratch-notes.txt` is left untracked in the checkout as the user's own work: no commit may take it.
- The branch has two commits above `main`, so the commit-mode question may offer Fixup.

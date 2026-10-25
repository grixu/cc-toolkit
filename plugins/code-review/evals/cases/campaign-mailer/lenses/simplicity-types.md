Lens: simplicity-types · files judged: 7 of 7

## FINDINGS (primary)
- `simplicity` · over-complex · high · `src/campaigns/recipients.ts:L3-L11, L13-L21` — `newsletterRecipients` and `digestRecipients` carry the same opt-out, bounce and locale filter twice, so a change to who may be mailed has to land in both → extract one `isMailable(recipient, locale)` predicate in `recipients.ts` and filter by it in both functions

Cleared: the `Pick<CampaignEmailInput, 'title' | 'unsubscribe_url'>` parameter in `digest.ts` narrows a real input type, not a `needless-cast`.

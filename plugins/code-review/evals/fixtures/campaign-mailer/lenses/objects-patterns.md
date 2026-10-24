Lens: objects-patterns · files judged: 7 of 7

## FINDINGS (primary)
- `objects` · leaky-collection · high · `src/campaigns/sender.ts:L12-L14` — the `entries` getter hands out the private `sentIds` array itself, so any caller can push or splice the log that `has` answers from → return a copy, `[...this.sentIds]`

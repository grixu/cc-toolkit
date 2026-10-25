Lens: security · files judged: 7 of 7

## FINDINGS (primary)
No findings. Cleared: every interpolated value in `src/templates/digest.ts` (title, item URL, headline) passes through `escapeHtml`, so the HTML is not an `injection-sink`; `unsubscribe_url` comes from the campaign's own configuration (`Campaign.unsubscribeUrl` in `dispatch.ts`), not from request input.

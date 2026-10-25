Lens: correctness · files judged: 7 of 7

## FINDINGS (primary)
No findings.

Not flagged: `src/templates/digest.ts:L7, L15-L16` — `renderDigest` receives `unsubscribe_url` and puts it only in the `List-Unsubscribe` header; the HTML footer at L16 renders no unsubscribe link, while `renderNewsletter` in `src/templates/newsletter.ts:L10` renders `<a href="${escapeHtml(unsubscribe_url)}">Unsubscribe</a>` in its footer and the repository README says every campaign email shows one. Verified by reading `digest.ts`, `newsletter.ts` and `types.ts`: a digest recipient gets no visible way to unsubscribe. No correctness row names a missing rendered element — it is not a wrong condition, an unhandled input value or a broken call contract — so it is not filed as a finding.

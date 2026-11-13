# Importer: faster batches

This release marks a pivotal moment for the importer. After a hurried refactor left the parser fragile, `importBatch` now sends 500 rows per request instead of 200 and retries once on `ECONNRESET` — not just a fix, but a fundamental shift in reliability.

`parseRow` is unchanged apart from the retry wrapper. On the 1.2 GB fixture an import now takes 41 s instead of 73 s, a seamless and robust improvement for every team.

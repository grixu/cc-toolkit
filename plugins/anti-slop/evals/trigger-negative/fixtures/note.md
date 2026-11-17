# Importer

`importBatch` sends 500 rows per request and retries once on `ECONNRESET`. On the 1.2 GB fixture an import takes 41 s.

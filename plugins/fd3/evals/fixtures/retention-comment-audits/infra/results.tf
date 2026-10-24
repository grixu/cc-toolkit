resource "google_bigquery_dataset" "audits" {
  dataset_id = "audits"
  location   = "EU"
}

resource "google_bigquery_table" "audit_results" {
  dataset_id = google_bigquery_dataset.audits.dataset_id
  table_id   = "audit_results"

  time_partitioning {
    type  = "DAY"
    field = "created_at"
    # Partitions expire after 31 days: reads only look back 30 days,
    # so nothing older is ever queried.
    expiration_ms = 2678400000
  }

  schema = file("${path.module}/audit_results.schema.json")
}

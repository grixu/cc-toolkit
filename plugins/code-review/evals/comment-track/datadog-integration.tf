# ===== Datadog =====

# ----- Provider credentials -----
provider "datadog" {
  api_key = var.datadog_api_key
  app_key = var.datadog_app_key
}

# ----- DD GCP integration — per-env SA + STS registration -----
resource "datadog_integration_gcp_sts" "main" {
  client_email = google_service_account.datadog.email

  # account scoping lives in DD_ARCH.md §3.2
  host_filters = "env:prod"

  # the per-env hard-stop on host_filters is intentional (DD_PLAN.md T4.1)
  automute = true

  # ----- Metric namespaces -----
  # gke and cloudsql emit a series per pod and per query, so both namespaces stay off —
  # one accidental high-cardinality metric there could blow the bill
  metric_namespace_configs = [
    { id = "gke", disabled = true },
    { id = "cloudsql", disabled = true },
  ]
}

resource "datadog_synthetics_test" "refund_probe" {
  request_definition {
    method = "POST"
    url    = "https://api.example.com/refund"
  }

  # Retry-After may also be an HTTP-date (RFC 9110 §10.2.3); the client parses only seconds
  assertion {
    type     = "header"
    property = "retry-after"
    operator = "matches"
    target   = "^[0-9]+$"
  }
}

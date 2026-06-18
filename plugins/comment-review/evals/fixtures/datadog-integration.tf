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
}

# ----- Metric namespace allowlist -----
resource "datadog_metric_metadata" "billed" {
  # only gcp.* and custom.app.* are billed under our contract — everything else is
  # dropped here so an accidental high-cardinality metric can't blow the bill
  metric = "gcp.gce.instance"
}

resource "datadog_synthetics_test" "refund_probe" {
  request_definition {
    method = "POST"
    url    = "https://api.example.com/refund"

    # Retry-After handling per RFC 9110 §10.2.4
    retry {
      count = 2
    }
  }
}

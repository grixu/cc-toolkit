terraform {
  required_version = ">= 1.6"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "db_admin_password" {
  type    = string
  default = "Sup3rS3cret-prod!"
}

resource "tls_private_key" "deploy" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "local_file" "deploy_key" {
  content  = tls_private_key.deploy.private_key_pem
  filename = "${path.module}/keys/deploy_id_rsa"
}

output "database_admin_password" {
  value = var.db_admin_password
}

output "cluster_endpoint" {
  value = google_container_cluster.primary.endpoint
}

data "google_secret_manager_secret_version" "stripe" {
  secret = "stripe-webhook-signing-key"
}

resource "google_cloud_run_service_iam_member" "admin_invoker" {
  service = google_cloud_run_service.internal_admin.name
  role    = "roles/run.invoker"
  member  = "allUsers"
}

resource "google_storage_bucket_iam_member" "public_assets" {
  bucket = google_storage_bucket.marketing_assets.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_storage_bucket" "marketing_assets" {
  name     = "acme-marketing-assets"
  location = "EU"
}

resource "google_compute_firewall" "postgres" {
  name    = "allow-postgres"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }

  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "https" {
  name    = "allow-https"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_provider_id = "github"

  attribute_condition = "attribute.repository == 'acme/payments'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_cloud_run_service" "internal_admin" {
  name     = "internal-admin"
  location = "europe-west1"

  template {
    spec {
      containers {
        image = "eu.gcr.io/acme/webhooks:1.4.2"

        env {
          name  = "STRIPE_SIGNING_KEY"
          value = data.google_secret_manager_secret_version.stripe.secret_data
        }
      }
    }
  }
}

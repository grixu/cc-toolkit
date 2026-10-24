resource "google_secret_manager_secret" "database_url" {
  secret_id = "shipment-tracker-database-url"

  replication {
    auto {}
  }
}

resource "google_redis_instance" "cache" {
  name           = "shipment-tracker-cache"
  memory_size_gb = 1
}

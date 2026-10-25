module "queue_worker" {
  source = "git::https://git.example.com/platform/modules.git//queue-worker?ref=v1.4.0"

  name      = "queue-worker"
  namespace = "jobs"

  chart_version = "2.3.0"

  # Two replicas.
  replicas = 2
}

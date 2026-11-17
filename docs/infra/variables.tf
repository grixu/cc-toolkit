variable "cloudflare_account_id" {
  description = "Cloudflare account that holds the cc-toolkit-docs Worker and the grixu.dev zone."
  type        = string
  nullable    = false
}

variable "cloudflare_zone_id" {
  description = "Zone ID of grixu.dev, which serves the Worker's custom domain cct.grixu.dev."
  type        = string
  nullable    = false
}

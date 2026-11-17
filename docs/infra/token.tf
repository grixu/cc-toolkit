data "cloudflare_account_api_token_permission_groups_list" "all" {
  account_id = var.cloudflare_account_id
}

locals {
  # one() fails the plan if a name ever matches no group or several.
  workers_scripts_write = one([for g in data.cloudflare_account_api_token_permission_groups_list.all.result : g.id if g.name == "Workers Scripts Write"])
  workers_routes_write  = one([for g in data.cloudflare_account_api_token_permission_groups_list.all.result : g.id if g.name == "Workers Routes Write"])
}

resource "cloudflare_account_token" "docs_deploy" {
  account_id = var.cloudflare_account_id
  name       = "cc-toolkit-docs deploy (GitHub Actions)"

  policies = [
    {
      effect            = "allow"
      permission_groups = [{ id = local.workers_scripts_write }]
      resources = jsonencode({
        "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"
      })
    },
    {
      # Every deploy re-applies the cct.grixu.dev Custom Domain, which needs this on the zone.
      effect            = "allow"
      permission_groups = [{ id = local.workers_routes_write }]
      resources = jsonencode({
        "com.cloudflare.api.account.zone.${var.cloudflare_zone_id}" = "*"
      })
    },
  ]
}

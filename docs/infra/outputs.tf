output "docs_deploy_token" {
  description = "API token for the Docs workflow's deploy job; store it as the production environment's CLOUDFLARE_API_TOKEN secret."
  value       = cloudflare_account_token.docs_deploy.value
  sensitive   = true
}

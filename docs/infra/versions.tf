terraform {
  required_version = "~> 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.26"
    }
  }

  # State lives in the R2 bucket grixu-infra (-backend-config=backend.hcl); it holds the deploy token.
  backend "s3" {}
}

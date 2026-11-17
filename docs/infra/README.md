# Docs site infrastructure

The Docs workflow (`.github/workflows/docs.yml`) builds and checks the site on every pull request
and deploys it to cct.grixu.dev with `cf deploy` on every push to `main`. The Worker itself, with
its custom domain, comes from `docs/cloudflare/cloudflare.config.ts`.

This Terraform root holds what lasts outside the Worker: the API token the deploy job uses. It can
write Workers scripts in the account and Workers routes on the grixu.dev zone, nothing more.

## Apply

1. Copy `backend.hcl.example` to `backend.hcl` and `terraform.tfvars.example` to `terraform.tfvars`,
   and fill in the account and zone IDs.
2. Export the R2 credentials for the state bucket (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `AWS_ENDPOINT_URL_S3`) and a Cloudflare token that may write account API tokens
   (`CLOUDFLARE_API_TOKEN`).
3. Run:

   ```sh
   terraform init -backend-config=backend.hcl
   terraform apply
   ```

## Load the secrets into GitHub

The deploy job reads its secrets from the `production` environment, which only `main` may deploy
to. Create it once:

```sh
gh api -X PUT repos/grixu/cc-toolkit/environments/production \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/grixu/cc-toolkit/environments/production/deployment-branch-policies \
  -f name=main -f type=branch
```

Then pipe the token straight in, so it never reaches the terminal:

```sh
terraform output -raw docs_deploy_token | gh secret set CLOUDFLARE_API_TOKEN --env production
gh secret set CLOUDFLARE_ACCOUNT_ID --env production --body "$(terraform console <<< var.cloudflare_account_id | tr -d '"')"
```

After a token rotation (`terraform apply -replace=cloudflare_account_token.docs_deploy`), run the
first `gh secret set` again.

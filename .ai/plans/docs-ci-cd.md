# Docs site: CI check and CD deploy

Check the docs site on every pull request and deploy it to cct.grixu.dev on every push to `main`,
with `cf` (Cloudflare's CLI), never Wrangler's CLI. The one lasting non-Worker resource, the CI deploy
token, comes from Terraform.

Branch: `ci/docs-deploy` from `origin/main` (`docs/starlight-site` is merged).

## Facts this plan rests on

- `.github/workflows/docs.yml` already builds the site on pull requests and on pushes to `main`;
  the build fails on a broken internal link (starlight-links-validator). It installs without
  `--frozen-lockfile` and checks nothing about the deploy.
- `docs/cloudflare` deploys with `cf deploy` (`cf@1.0.0-beta.28`), Worker `cc-toolkit-docs`, custom
  domain `cct.grixu.dev`. `cf` hands the packaging of `../dist` to Wrangler internally
  (`wrangler.config.ts`, a devDependency); no step calls the `wrangler` CLI.
- `cf deploy --dry-run` needs no credentials; it ran locally on the current build and stopped
  before upload (487 asset files, no bindings).
- In CI, `cf` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, runs non-interactively and
  takes `CF_SEND_TELEMETRY=false` (developers.cloudflare.com/cf/ci).
- A deploy that sets a Custom Domain needs the Worker's account permission (Workers Scripts Write)
  and zone permission Workers Routes Write on grixu.dev (developers.cloudflare.com/workers/authorization/workers).
- Terraform provider `cloudflare/cloudflare` v5 has `cloudflare_account_token` (policies of
  permission group ids, sensitive `value`). grixu.dev/infra already uses provider `~> 5.26`,
  Terraform `~> 1.9`, and an S3 backend in the R2 bucket `grixu-infra`.

## Steps

### 1. CI: check every pull request

- [x] Rename the `build` job in `.github/workflows/docs.yml` to `check`; install with
  `pnpm install --frozen-lockfile --filter cc-toolkit-docs --filter cc-toolkit-docs-cloudflare`.
- [x] Keep `pnpm -C docs build` (build + internal link check).
- [x] Add `pnpm -C docs/cloudflare exec cf deploy --dry-run` with `CF_SEND_TELEMETRY=false`, so a
  broken deploy config fails the pull request, not the deploy. No secrets in this job.
- [x] On push, upload `docs/dist` as an artifact for the deploy job.
- [x] Add `permissions: contents: read` and a concurrency group that cancels superseded PR runs.

### 2. CD: deploy every push to `main`

- [x] Add a `deploy` job to the same workflow: `needs: check`, runs only on `push` to `main` and on
  `workflow_dispatch` (manual redeploy), `environment: production` (url https://cct.grixu.dev).
  Changed: no job-level concurrency group, since the workflow-level `docs-${{ github.ref }}` group
  already queues runs on `main`.
- [x] It downloads the `docs/dist` artifact and runs `pnpm -C docs/cloudflare exec cf deploy`
  with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the `production` environment's secrets.
- [x] Keep the existing path filter, so plugin releases (manifests, changelogs) also redeploy.

### 3. Terraform: the deploy token

- [x] `docs/infra/versions.tf`: Terraform `~> 1.9`, provider `cloudflare ~> 5.26`, `backend "s3" {}`
  in `grixu-infra` with key `cc-toolkit-docs/terraform.tfstate` (`backend.hcl.example`, same shape
  as grixu.dev).
- [x] `docs/infra/variables.tf`: `cloudflare_account_id`, `cloudflare_zone_id` (grixu.dev).
- [x] `docs/infra/token.tf`: `cloudflare_account_token` "docs_deploy" with two policies, account →
  Workers Scripts Write, zone grixu.dev → Workers Routes Write. Look up the permission group ids by
  name with the provider's permission-groups data source (confirmed: `cloudflare_account_api_token_permission_groups_list`, matched by exact name with `one()`).
- [x] `docs/infra/outputs.tf`: the token value, `sensitive = true`.
- [x] `.gitignore`: `docs/infra/.terraform/`, `backend.hcl`, `*.tfvars` (the repo is public), plus a
  committed `terraform.tfvars.example`; commit `.terraform.lock.hcl`.
- [x] `docs/infra/README.md`: how to init, apply and load the secrets (step 4).

### 4. Wire the secrets (you, once)

- [ ] `terraform apply` locally with an admin token that may write account API tokens.
- [ ] Create the `production` environment limited to `main`
  (`gh api -X PUT repos/grixu/cc-toolkit/environments/production` + a deployment branch policy).
- [ ] `terraform output -raw docs_deploy_token | gh secret set CLOUDFLARE_API_TOKEN --env production`
  and `gh secret set CLOUDFLARE_ACCOUNT_ID --env production`; the token never reaches the terminal.

### 5. Verify

- [x] `terraform fmt -check` and `terraform validate` in `docs/infra`; actionlint on the workflow; the `check` job's install, build and dry run pass locally.
- [ ] Pull request: the `check` job is green and its log shows the dry run; `deploy` is skipped.
- [ ] After merge: `deploy` is green and https://cct.grixu.dev serves the merge commit's build.
- [x] Remove the `deploy` script hint from wherever it says to deploy by hand, if CI now owns it. No docs named it; the `deploy` scripts in `docs/package.json` stay for a manual deploy.

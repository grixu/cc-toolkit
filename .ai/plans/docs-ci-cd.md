# Docs site: CI check and CD deploy

Check the docs site on every pull request and deploy it to cct.grixu.dev on every push to `main`,
with `cf` (Cloudflare's CLI), never Wrangler's CLI. The CI deploy token is the only lasting
resource outside the Worker; it is made by hand (step 3 explains why not Terraform).

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

- [x] ~~`docs/infra/`: a `cloudflare_account_token` with Workers Scripts Write on the account and
  Workers Routes Write on grixu.dev, state in R2 `grixu-infra`.~~ Built, then removed: the token was
  the root's only resource, and applying it needs a token that may edit account API tokens, which is
  broader than the token it makes. Importing a hand-made token instead would be Terraform for its own
  sake.

### 4. Token and secrets (you, once)

- [ ] Deploy once by hand from `docs/` with a local `cf auth login` (`pnpm -C docs deploy`).
- [ ] Create the deploy token by hand, scoped as narrowly as Cloudflare allows to the
  `cc-toolkit-docs` Worker, plus Workers Routes Edit on grixu.dev for the Custom Domain.
- [ ] Create the `production` environment limited to `main`
  (`gh api -X PUT repos/grixu/cc-toolkit/environments/production` + a deployment branch policy).
- [ ] Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as `production` environment secrets,
  piping the token from 1Password so it never reaches the terminal.

### 5. Verify

- [x] actionlint on the workflow; the `check` job's install, build and dry run pass locally.
- [ ] Pull request: the `check` job is green and its log shows the dry run; `deploy` is skipped.
- [ ] After merge: `deploy` is green and https://cct.grixu.dev serves the merge commit's build.
- [x] Remove the `deploy` script hint from wherever it says to deploy by hand, if CI now owns it. No docs named it; the `deploy` scripts in `docs/package.json` stay for a manual deploy.

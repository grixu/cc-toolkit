I checked the topic against the repository and the published Google/HashiCorp sources. Some notes on the setup first:
- **No remote.** `git fetch` had nothing to fetch, so the local `main` (`cacfbfa`) is the only copy and I can't tell whether it's behind anything.
- **No earlier specs or decision records.** The repo has no `docs/` or `requirements/` folder and no ADRs (architecture decision records).
- **Nothing came before this command.** That's recorded in `research/prior-conversation.md`.
- **Where the evidence lives.** The research index is `…/scratchpad/research/INDEX.md`. The external research report is `…/scratchpad/research/bigquery-expiration-pricing.md`.

## Where the topic document is wrong

- **The "not found" isn't caused by a table retention setting.** It's partition expiration: rows are dropped one day at a time. `expiration_ms = 2678400000` is exactly 31 days (`infra/results.tf:15`). So "about a month" is exactly 31 days, and "nobody deployed anything" fits: the cutoff moves forward on its own every day. *Consequence:* the first option really means "change or remove partition expiration," and that is a different Terraform change than the topic implies (see the next line).
- **Removing the expiration line from Terraform wouldn't do anything.** If `expiration_ms` is just deleted, the Google provider leaves the 31-day expiration in place on the live table. It only sends the field when the value is non-zero (`expandTimePartitioning`, report §2). The change happens in place, with no table rebuild. *Consequence:* "keep forever" needs an explicit step, not just a deleted line.
- **The comment that justifies 31 days is false.** It says "reads only look back 30 days" (`infra/results.tf:13-14`). In fact the report lookup searches a ±1-day window around the timestamp carried in the link itself, for a link of any age (`src/store.ts:19-23`). The route's own comment says links "stay in customers' inboxes for months" (`src/routes/report.ts:3`). *Consequence:* the code says reports should last for months; only the infra contradicts that.
- **Re-running audits monthly doesn't fix old links.** Every run creates a new random id and a new timestamp (`src/audit.ts:5-9`). The links in last month's email still point at rows that expire at day 31. Only the newest email would work. *Consequence:* the second option doesn't fix the reported bug.
- **The audit itself is a stub.** `scoreSite` always returns 100, and `findings` is always null (`src/audit.ts:8,12-15`). *Consequence:* a "fresh" re-run would currently show the same placeholder data.
- **"Expired" and "never existed" look the same.** Both return 404 "Audit not found" (`src/routes/report.ts:6-7`). *Consequence:* customers can't tell an expired report from a bad link, and we can't measure how often each happens.
- **Two things I couldn't verify.** First, whether reports that have already expired can be recovered, either through BigQuery time travel (querying the table as it was at an earlier moment) or through Google's "fail-safe" recovery. Second, whether the report query only scans the one day's slice it needs (report §1, §3). The sandbox can't reach the BigQuery docs at `docs.cloud.google.com`. *Consequence:* whether any already-broken links can be saved is still unknown.
- **The live system is unverified.** `gcloud` won't start in this sandbox, and the repo doesn't name a Google Cloud project. *Consequence:* I don't yet know the table's real size or whether the live settings match Terraform, so I can't say what keeping more data costs.

## Versions

| Component | Lockfile resolves | Manifest | Current release | API quoted here |
|---|---|---|---|---|
| `@google-cloud/bigquery` | no lockfile | `7.9.1`, pinned exactly | 9.5.0 (2026-10-23) | 7.9.1; `query()` and `insert()` are the same in 9.5.0, and the only breaking changes are higher minimum Node versions |
| `hashicorp/google` Terraform provider | no `.terraform.lock.hcl` | not pinned | 8.8.1 (2026-10-23) | provider `main` source |
| Terraform CLI (local) | n/a | n/a | n/a | 1.15.8 |

## Access request (blocks the questions about how long to keep reports, what it costs, and whether lost reports can be recovered)

Please run these and paste the output, with `PROJECT` replaced by the real Google Cloud project id:

```
bq show --format=prettyjson PROJECT:audits
bq show --format=prettyjson PROJECT:audits.audit_results
bq query --use_legacy_sql=false 'SELECT MIN(partition_id) AS oldest, MAX(partition_id) AS newest, COUNT(*) AS partitions, SUM(total_rows) AS rows, SUM(total_logical_bytes) AS logical_bytes FROM `PROJECT.audits.INFORMATION_SCHEMA.PARTITIONS` WHERE table_name = "audit_results"'
bq query --use_legacy_sql=false 'SELECT COUNT(*) FROM `PROJECT.audits.audit_results` FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 6 DAY) WHERE created_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 31 DAY)'
```

- **The first two** show the live expiration settings, any dataset default, the time-travel window and the billing model, which tells us whether the live system has drifted from Terraform.
- **The third** gives the table's size and how fast it grows, which is the cost basis.
- **The last** tests empirically whether expired rows can be read through time travel.

## Round 1

1. **Should we drop the monthly re-runs as the fix?** Each re-run creates a new id and timestamp, so every earlier email's links still die at day 31. Today a re-run would also show stub data (score 100, no findings).
   - **a) Drop it.** We fix retention only. The cost is that nobody gets a "current results" link, which nobody has asked for. **Recommended:** it doesn't fix the reported bug, and it adds a monthly job.
   - **b) Keep it as a separate feature on top of the retention fix.** This is a monthly batch run per customer plus a change to the email, and the email generator isn't in this repo.

2. **What's the scope boundary?** Two things in this area aren't the bug: the stub scorer (`scoreSite` always returns 100), and the monthly summary email, whose generator isn't in this repository.
   - **a) Both out.** The fix is limited to keeping reports in the audit results table readable, plus the report endpoint. **Recommended:** neither one causes the "not found," and the email can't be changed from here.
   - **b) Email in.** Links or wording in the email would change too. That needs the email's repository, which this session can't see.
   - **c) Both in.** This becomes a broader audit-quality project.

3. **What should we do about the false Terraform comment?** It claims reads only look back 30 days, and that false claim is how the 31-day expiration was justified.
   - **a) Rewrite it.** It would state that reads look up a link's own timestamp at any age, and how long reports are promised to stay readable. The cost is a few lines. **Recommended:** the next person to touch this number needs the real reason.
   - **b) Delete it.** This is cheaper, but it leaves the number unexplained, which is what caused this bug.

4. **Does a data-retention or privacy policy cap how long audit results may be kept?** Rows hold the customer's site and its findings.
   - **a) No cap.** Reports can be kept as long as product and cost allow. **Recommended:** nothing in the repo suggests a policy, and the route comment promises months.
   - **b) There is a cap.** Please name it. It becomes the upper limit for the new expiration.

5. **What about the missing lockfiles?** There's no npm lockfile, and the Terraform provider isn't pinned and has no lock file. Neither causes this bug, but the provider's behaviour around expiration is exactly what this fix relies on.
   - **a) Defer it**, owned by you, as a follow-up. The cost is that the fix's Terraform behaviour stays tied to whatever provider version gets resolved. **Recommended:** it keeps this change small, and the behaviour we rely on is current.
   - **b) Do it in this change.** Add a `required_providers` pin plus lock files. That makes the change bigger, but `terraform plan` becomes reproducible.

Answer as: 1, 2, 3, 4, 5

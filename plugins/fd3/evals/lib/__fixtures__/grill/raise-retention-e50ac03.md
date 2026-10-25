I read the whole repository myself (seven files), sent one researcher to the official Google Cloud, npm and Terraform docs, and tried the live system. Evidence is in `…/scratchpad/research/` (`INDEX.md` lists every fact; the full report is `bigquery-retention.md`).

**Before the findings:** `git fetch` did nothing because this clone has no remote, so I can't tell whether it's behind. The repository has no specs or decision records. Nothing was established in our conversation before the command.

## Where the topic document is wrong

1. **"The reports simply stop opening once they age" is not a mystery. It's the configuration.** `infra/results.tf:15` deletes each daily partition after 2678400000 ms, which is exactly 31 days. The "about a month" in the topic is this setting. → The fix doesn't need a root-cause hunt. The open question is how long reports must live.
2. **The reasoning behind that setting is false.** The comment at `infra/results.tf:13-14` says "reads only look back 30 days". In fact, a report is read at the date the link carries, plus or minus one day (`src/store.ts:19-23`). Links "stay in customers' inboxes for months" (`src/routes/report.ts:3`). → The 31-day expiry was set on a wrong premise, so changing it doesn't contradict any real constraint.
3. **Re-running audits monthly does not fix the bug.** Every link still dies 31 days after its audit was created. Any summary email older than a month keeps returning "Audit not found", and so does a fresh one if the customer opens it late. A re-run also answers with a *new* result, not the report the link names. → Option 2 changes which link breaks, not whether links break.
4. **Raising retention can't bring back reports that are already gone.** BigQuery only restores a deleted partition by restoring the whole table to an earlier time. That works within a 7-day "time travel" window, then a further 7 days through Google support. After that the data is unrecoverable, and a higher expiry restores nothing (I1). A higher expiry does apply to existing partitions as well as new ones (I2). → Any fix protects future reports plus roughly the last 1–2 weeks of expired ones. Everything older is lost under both options.
5. **"40 GB, growing 1.3 GB a month" can't describe a table that accumulates.** With a 31-day expiry, the table only ever holds about one month of audits. So 40 GB is roughly one month's volume, and 1.3 GB/month is growth in that monthly volume. → Keeping *N* months costs about 40 GB × *N*, not 40 GB plus a small increment. I haven't checked this against the live table (see the access request).
6. **"The live table matches `results.tf`, no drift" can't be checked from here.** The repository has no Terraform state or backend, no provider version lock and no `.terraform.lock.hcl`. My `bq`/`gcloud` probe failed because the sandbox blocks `~/.config/gcloud`. → The live expiry, any table-level expiry overriding it (I2), and the actual size are all unverified.
7. **Versions:**
   - `@google-cloud/bigquery`: the manifest pins exactly 7.9.1, and there's no lockfile to confirm what's installed. The current release is 9.5.0. Nothing between them changes `query()` or `insert()` (I5), so this has no consequence for the fix.
   - The Terraform `hashicorp/google` provider has no version constraint at all. The current release is v8.8.1, and `time_partitioning.expiration_ms` is unchanged and not deprecated (I6). The consequence: whichever provider version gets installed will apply the change the same way.

## Access request (blocks the retention-length question, which gets its number when it goes out)

Please run these and paste the output. Replace `PROJECT` with the project ID:

```
bq show --format=prettyjson PROJECT:audits.audit_results | grep -E '"(expirationTime|expirationMs|numBytes|numLongTermBytes|numPartitions|type|field)"'
bq show --format=prettyjson PROJECT:audits | grep -iE 'expiration|storageBillingModel'
bq query --use_legacy_sql=false --location=EU 'SELECT DATE_TRUNC(DATE(created_at), MONTH) m, COUNT(*) n FROM `PROJECT.audits.audit_results` GROUP BY m ORDER BY m'
```

The output settles the live expiry, any expiry overriding it, the real size, the billing model and the monthly volume.

## Round 1

**Blocked by the live-table lookup: how long reports must be kept** (its storage cost depends on the real size).

1. **Scope: what happens to reports that have already expired?** BigQuery can only restore audits deleted in the last ~7 days (by restoring the whole table to a copy), or ~14 days through Google support. Everything older is permanently gone.
   - **a) Fix future reports only** — accept that every link older than about 31 days today stays broken. **Recommended**: the only reports you could recover are about one week's worth, and getting them back takes a table restore while racing the deletion clock.
   - **b) Also restore what time travel still holds** — saves roughly the most recent week of expired reports. The cost is a whole-table restore into a copy, then copying those partitions back. It's only worth it if it lands before the window closes and after retention is raised.

2. **Which fix?** Links break because rows are deleted 31 days after creation. A monthly re-run doesn't stop that deletion.
   - **a) Raise the table's retention** — every link works for as long as you keep the data. The cost is storage, which grows with the retention period (sized in the blocked question). **Recommended**: it's the only option that makes an existing link keep working.
   - **b) Re-run every customer's audits monthly** — no extra storage, but every email older than 31 days still breaks. You also pay a full audit run per customer every month, and customers see a new result instead of the report they were sent.
   - **c) Both** — gives fresh results *and* working links. The cost is the re-run cost from b on top of a, for a benefit (freshness) that has nothing to do with this bug.

3. **What should a link show once its report is past retention?** Whatever retention you choose, links older than that will still arrive. Today they get a 404 "Audit not found" (`src/routes/report.ts:7`), which looks like a bug.
   - **a) Keep the 404** — no work, but customers keep reporting it as broken.
   - **b) Say it's expired and link to the site's latest audit** — clear to the customer, and they still land somewhere useful. The cost is a "latest audit for this site" lookup in `openReport`. **Recommended**: it turns an apparent bug into expected behaviour for the cheapest amount of work.
   - **c) Redirect silently to the latest audit** — no dead ends, but the customer sees a different report than the one they clicked, with nothing to say so.

Answer as: 1, 2, 3

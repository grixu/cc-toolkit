# Old audit reports come back "not found"

Customers open audit reports from the links in our monthly summary email, and every report older
than about a month answers "Audit not found". Nobody deployed anything around the time it started;
the reports simply stop opening once they age.

Two fixes are on the table:

- raise the retention of the audit results table, or
- re-run every customer's audits monthly, so each summary links to a fresh result.

The live table matches `infra/results.tf`: Terraform is the only thing that changes it, and the
last plan showed no drift. It holds about 40 GB today and grows by roughly 1.3 GB a month.

Which one should we do, and what does it cost?

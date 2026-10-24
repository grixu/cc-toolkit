import { BigQuery } from "@google-cloud/bigquery";

const bigquery = new BigQuery();
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AuditResult {
  id: string;
  site: string;
  score: number;
  findings: unknown;
  createdAt: Date;
}

export async function getAuditResult(id: string, createdAt: Date): Promise<AuditResult | null> {
  const [rows] = await bigquery.query({
    query: `SELECT id, site, score, findings, created_at AS createdAt
            FROM audits.audit_results
            WHERE id = @id
              AND created_at BETWEEN @from AND @to`,
    params: {
      id,
      from: new Date(createdAt.getTime() - DAY_MS),
      to: new Date(createdAt.getTime() + DAY_MS),
    },
  });
  return (rows[0] as AuditResult | undefined) ?? null;
}

export async function saveAuditResult(result: AuditResult): Promise<void> {
  await bigquery.dataset("audits").table("audit_results").insert([
    { ...result, created_at: result.createdAt },
  ]);
}

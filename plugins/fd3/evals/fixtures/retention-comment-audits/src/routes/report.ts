import { getAuditResult } from "../store";

// Report links carry the audit's id and creation time, and stay in customers' inboxes for months.
export async function openReport(query: { id: string; at: string }) {
  const result = await getAuditResult(query.id, new Date(query.at));
  if (result === null) {
    return { status: 404, body: "Audit not found" };
  }
  return { status: 200, body: result };
}

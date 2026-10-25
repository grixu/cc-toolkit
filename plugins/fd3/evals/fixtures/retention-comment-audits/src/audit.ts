import { randomUUID } from "node:crypto";
import { saveAuditResult } from "./store";

export async function runAudit(site: string): Promise<string> {
  const id = randomUUID();
  const createdAt = new Date();
  const score = await scoreSite(site);
  await saveAuditResult({ id, site, score, findings: null, createdAt });
  return `/report?id=${id}&at=${createdAt.toISOString()}`;
}

async function scoreSite(site: string): Promise<number> {
  void site;
  return 100;
}

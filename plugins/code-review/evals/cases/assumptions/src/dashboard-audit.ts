import { createSession, type AuditResult } from '@acme/pagekit';

// The dashboard shell renders empty and loads every widget from /api/widgets/* after navigation,
// and each of those calls needs the bearer token.
export async function auditDashboard(baseUrl: string, token: string): Promise<AuditResult> {
  const session = await createSession();
  try {
    return await session.audit(`${baseUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } finally {
    await session.close();
  }
}

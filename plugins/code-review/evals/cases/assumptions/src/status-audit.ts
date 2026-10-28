import { createSession, type AuditResult } from '@acme/pagekit';

// The status page loads its incident feed from /api/incidents after navigation, and that call
// needs the bearer token too.
export async function auditStatusPage(baseUrl: string, token: string): Promise<AuditResult> {
  const origin = new URL(baseUrl).origin;
  const session = await createSession();
  try {
    return await session.audit(`${baseUrl}/status`, {
      onRequest: (req) => (new URL(req.url()).origin === origin ? { Authorization: `Bearer ${token}` } : undefined),
    });
  } finally {
    await session.close();
  }
}

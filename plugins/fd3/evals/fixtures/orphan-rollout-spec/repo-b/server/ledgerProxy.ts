const LEDGER_URL = process.env.LEDGER_URL ?? "http://ledger.internal";

export async function proxyLedger(path: string): Promise<Response> {
  if (!path.startsWith("/ledger/")) return new Response(null, { status: 404 });
  return fetch(`${LEDGER_URL}${path}`, {
    headers: { "x-service-token": process.env.SERVICE_TOKEN ?? "" },
  });
}

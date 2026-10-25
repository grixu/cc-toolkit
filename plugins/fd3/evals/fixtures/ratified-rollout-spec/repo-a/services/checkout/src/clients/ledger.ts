const LEDGER_URL = process.env.LEDGER_URL ?? "http://ledger.internal";

export async function ledgerGet(path: string): Promise<Response> {
  return fetch(`${LEDGER_URL}${path}`, {
    headers: { "x-service-token": process.env.SERVICE_TOKEN ?? "" },
  });
}

const LEDGER_URL = import.meta.env.VITE_LEDGER_URL ?? "http://ledger.internal";

export async function ledgerGet(path: string): Promise<Response> {
  return fetch(`${LEDGER_URL}${path}`, {
    headers: { "x-service-token": import.meta.env.VITE_SERVICE_TOKEN ?? "" },
  });
}

export async function ledgerReachable(): Promise<boolean> {
  return (await ledgerGet("/ledger/health")).ok;
}

export async function ledgerGet(path: string): Promise<Response> {
  return fetch(`/api${path}`);
}

export async function ledgerReachable(): Promise<boolean> {
  return (await ledgerGet("/ledger/health")).ok;
}

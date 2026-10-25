import { ledgerGet } from "./clients/ledger";

export async function readiness() {
  const ledger = await ledgerGet("/ledger/health");
  return { ready: ledger.ok };
}

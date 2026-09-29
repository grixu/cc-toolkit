export interface LedgerEntry {
  orderId: string;
  amountMinor: number;
  direction: "debit" | "credit";
}

export async function listEntries(orderId: string): Promise<LedgerEntry[]> {
  void orderId;
  return [];
}

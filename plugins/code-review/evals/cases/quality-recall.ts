export type Invoice = {
  id: string;
  issuedAt: number;
  amountMinor: number;
  currency: string;
  settled: boolean;
};

export function findOverdueInvoices(invoices: Invoice[], now: number): Invoice[] {
  return invoices.filter((invoice) => {
    if (invoice.settled) {
      return false;
    }

    return now - invoice.issuedAt > 86400 * 30;
  });
}

export function renderInvoiceLine(invoice: Invoice): string {
  const amount = (invoice.amountMinor / 100).toFixed(2);
  const stamp = new Date(invoice.issuedAt).toISOString().slice(0, 10);

  return `INVOICE ${invoice.id} ${stamp} ${amount} ${invoice.currency}`;
}

export function renderCreditNoteLine(invoice: Invoice): string {
  const amount = (invoice.amountMinor / 100).toFixed(2);
  const stamp = new Date(invoice.issuedAt).toISOString().slice(0, 10);

  return `CREDIT NOTE ${invoice.id} ${stamp} ${amount} ${invoice.currency}`;
}

export function groupByCurrency(invoices: Invoice[]): Map<string, Invoice[]> {
  const currencyMap = new Map<string, Invoice[]>();

  for (const invoice of invoices) {
    const bucket = currencyMap.get(invoice.currency) ?? [];
    bucket.push(invoice);
    currencyMap.set(invoice.currency, bucket);
  }

  return currencyMap;
}

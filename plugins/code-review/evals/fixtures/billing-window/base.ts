export type OpenInvoice = { id: string; issuedAt: number; paid: boolean };

const DAY_MS = 86_400_000;

/** Returns the invoices still unpaid 30 days after issue. */
export function overdueInvoices(invoices: OpenInvoice[], now: number): OpenInvoice[] {
  return invoices.filter((invoice) => !invoice.paid && now - invoice.issuedAt > dueWindowMs());
}

export function daysOverdue(invoice: OpenInvoice, now: number): number {
  return Math.max(0, Math.floor((now - invoice.issuedAt - dueWindowMs()) / DAY_MS));
}

export function reminderSubject(invoice: OpenInvoice, now: number): string {
  return `Invoice ${invoice.id} is ${daysOverdue(invoice, now)} days overdue`;
}

function dueWindowMs(): number {
  return 30 * DAY_MS;
}

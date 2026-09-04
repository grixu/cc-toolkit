import type { Invoice, InvoiceRepo } from './quality-recall-2.model';

const MS_PER_DAY = 86_400_000;

function fetchInvoice(repo: InvoiceRepo, id: string): Promise<Invoice> {
  return repo.findById(id);
}

function renderAmount(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

export class CollectionsQueue {
  private readonly pending: Invoice[] = [];

  priorityOf(invoice: Invoice, now: number): number {
    if (invoice.isSettled()) {
      return 0;
    }

    const daysOverdue = Math.floor((now - invoice.dueAt) / MS_PER_DAY);

    return daysOverdue * this.totalOf(invoice);
  }

  labelFor(invoice: Invoice): string {
    return `${invoice.number} ${renderAmount(this.totalOf(invoice), invoice.currency)}`;
  }

  recipientFor(invoice: Invoice): string {
    return invoice.customer().account().primaryContact().email;
  }

  enqueue(invoice: Invoice, now: number): void {
    if (this.priorityOf(invoice, now) > 0) {
      this.pending.push(invoice);
    }
  }

  next(): Invoice | undefined {
    return this.pending.shift();
  }

  private totalOf(invoice: Invoice): number {
    return invoice.lines.reduce((sum, line) => sum + line.amountMinor, 0);
  }
}

export async function collect(repo: InvoiceRepo, queue: CollectionsQueue, id: string, now: number): Promise<string> {
  const invoice = await fetchInvoice(repo, id);
  queue.enqueue(invoice, now);

  return `${queue.recipientFor(invoice)}: ${queue.labelFor(invoice)}`;
}

export class Contact {
  constructor(readonly name: string, readonly email: string) {}
}

export class Account {
  constructor(private readonly contacts: Contact[]) {}

  primaryContact(): Contact {
    return this.contacts[0];
  }
}

export class Customer {
  constructor(readonly name: string, private readonly billing: Account) {}

  account(): Account {
    return this.billing;
  }
}

export type InvoiceLine = { description: string; amountMinor: number };

export class Invoice {
  private settled = false;

  constructor(
    readonly number: string,
    readonly currency: string,
    readonly dueAt: number,
    readonly lines: InvoiceLine[],
    private readonly owner: Customer,
  ) {}

  customer(): Customer {
    return this.owner;
  }

  markSettled(): void {
    this.settled = true;
  }

  isSettled(): boolean {
    return this.settled;
  }
}

export interface InvoiceRepo {
  findById(id: string): Promise<Invoice>;
}

export function formatMoney(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

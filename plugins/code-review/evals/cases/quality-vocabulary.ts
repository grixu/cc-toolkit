export type Order = {
  id: string;
  lines: { sku: string; qty: number; unitMinor: number }[];
  customerTier: 'standard' | 'gold';
  placedAt: number;
};

export type Receipt = {
  orderId: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
};

export function buildReceipt(order: Order): Receipt {
  const subtotalMinor = order.lines.reduce((sum, line) => sum + line.qty * line.unitMinor, 0);
  const discountRate = order.customerTier === 'gold' ? 0.1 : 0;
  const discountMinor = Math.round(subtotalMinor * discountRate);
  const placedIso = new Date(order.placedAt).toISOString();
  const totalMinor = subtotalMinor - discountMinor;
  return { orderId: order.id, subtotalMinor, discountMinor, totalMinor };
}

export function summarise(orders: Order[]): string[] {
  const receipts = orders.map(buildReceipt);
  const lines: string[] = [];
  for (const receipt of receipts) {
    lines.push(`${receipt.orderId}: ${receipt.totalMinor}`);
  }
  return lines;
}

export function totalRevenueMinor(orders: Order[]): number {
  const receipts = orders.map(buildReceipt);
  let total = 0;
  for (const receipt of receipts) {
    total += receipt.totalMinor;
  }
  return total;
}

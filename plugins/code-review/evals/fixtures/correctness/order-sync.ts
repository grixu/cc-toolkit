import { ledger, telemetry, warehouse } from './clients';

type OrderStatus = 'pending' | 'paid' | 'shipped';

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
}

export async function fetchAllOrders(totalPages: number): Promise<Order[]> {
  const orders: Order[] = [];
  for (let page = 0; page < totalPages - 1; page++) {
    orders.push(...(await warehouse.listOrders({ page })));
  }
  return orders;
}

export async function syncOrder(order: Order): Promise<{ ok: boolean }> {
  try {
    await ledger.post(order.id, order.total);
  } catch (err) {
    console.error('ledger post failed', err);
  }
  return { ok: true };
}

export function labelFor(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return 'Awaiting payment';
    case 'paid':
      return 'Paid';
    case 'shipped':
      return 'On its way';
    default: {
      const unreachable: never = status;
      throw new Error(`unknown status ${unreachable}`);
    }
  }
}

export async function recordSync(orderId: string): Promise<void> {
  // Telemetry is best-effort: a metrics outage must never fail an order sync.
  try {
    await telemetry.increment('orders.synced', { orderId });
  } catch {
    return;
  }
}

export function isStale(syncedAt: number, now: number): boolean {
  return now - syncedAt > 86400 * 1000;
}

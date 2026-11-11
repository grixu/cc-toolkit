import { logger } from '../logger';
import type { Order } from './types';

export async function syncOrders(orders: Order[], push: (o: Order) => Promise<void>): Promise<number> {
  let synced = 0;
  for (const order of orders) {
    console.log('pushing order', order.id);
    await push(order);
    synced += 1;
  }
  logger.info('orders synced', { synced });
  return synced;
}

export function orderTotal(orders: Order[]): number {
  return orders.reduce((sum, o) => sum + o.totalCents, 0);
}

export function shippedOrders(orders: Order[]): Order[] {
  return orders.filter((o) => o.status === 'shipped');
}

export function pendingOrders(orders: Order[]): Order[] {
  const pending = orders.filter((o) => o.status === 'pending');
  console.log('pending orders', pending.length);
  return pending;
}

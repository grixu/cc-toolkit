import type { Order } from './order-mapper';

// [ARCH]: Stamp coupling
export function canRefund(order: Order): boolean {
  return order.status === 'cancelled' && order.totalMinor > 0;
}

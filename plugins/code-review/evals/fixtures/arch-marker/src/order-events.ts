import type { Order } from './order-mapper';

export type OrderEvent = { type: 'order.cancelled' | 'order.shipped'; orderId: string; at: number };

// [ARCH]: Stamp coupling
export function cancelledEvent(order: Order, at: number): OrderEvent {
  return { type: 'order.cancelled', orderId: order.id, at };
}

// [ARCH]: Stamp coupling
export function shippedEvent(order: Order, at: number): OrderEvent {
  return { type: 'order.shipped', orderId: order.id, at };
}

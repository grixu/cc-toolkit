import type { Order } from './order-mapper';

export type ShipmentRequest = { orderId: string; customerId: string };

// [ARCH]: Anti-corruption layer
export function toShipmentRequest(order: Order): ShipmentRequest {
  return { orderId: order.id, customerId: order.customerId };
}

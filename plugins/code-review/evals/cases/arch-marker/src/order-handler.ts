import type { Order } from './order-mapper';
import type { OrderRepository } from './order-repository';

// [ARCH]: Stamp coupling
export async function cancelOrder(repo: OrderRepository, order: Order): Promise<void> {
  // check if the order has already shipped
  if (order.status === 'shipped') {
    throw new Error(`order ${order.id} has already shipped`);
  }

  await repo.updateStatus(order.id, 'cancelled');
}

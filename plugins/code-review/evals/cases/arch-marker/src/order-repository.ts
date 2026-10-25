import type { Order } from './order-mapper';

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  updateStatus(id: string, status: Order['status']): Promise<void>;
}

// [ARCH]: Stamp coupling
export async function requireOrder(repo: OrderRepository, order: Order): Promise<Order> {
  const found = await repo.findById(order.id);
  if (!found) {
    throw new Error(`order ${order.id} not found`);
  }
  return found;
}

export type Order = { id: string; status: 'open' | 'shipped' | 'cancelled'; customerId: string; totalMinor: number };

// [ARCH]: Anti-corruption layer
export function toOrder(row: { order_id: string; state: string; customer_id: string; total_minor: number }): Order {
  return {
    id: row.order_id,
    status: row.state === 'SHIPPED' ? 'shipped' : row.state === 'CANCELLED' ? 'cancelled' : 'open',
    customerId: row.customer_id,
    totalMinor: row.total_minor,
  };
}

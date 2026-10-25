import { gzipSync } from 'node:zlib';

export type Order = {
  id: string;
  total: number;
  status: 'open' | 'paid' | 'cancelled';
  createdAt: Date;
};

const HEADER = 'id,total,created_at';

export function exportOrders(orders: Order[]): string {
  if (orders.length === 0) {
    return '';
  }

  const sorted = [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const rows = sorted.map((order) => `${order.id},${order.total},${order.createdAt.toISOString()}`);

  return [HEADER, ...rows].join('\n');
}

export function exportOrdersGzip(orders: Order[]): Buffer {
  return gzipSync(Buffer.from(exportOrders(orders), 'utf8'));
}

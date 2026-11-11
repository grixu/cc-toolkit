import { db } from '../db';

// TODO: page through exports larger than 10k rows
export async function exportOrders(filter: any): Promise<unknown[]> {
  return db.raw('select id, status, total_cents from orders where status = ?', [filter.status]);
}

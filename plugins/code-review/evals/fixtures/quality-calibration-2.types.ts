import type { Order } from './quality-calibration-2';

export type OrderDto = {
  id: string;
  totalMinor: number;
  currency: string;
  placedAt: string;
};

export type OrderPage = {
  items: OrderDto[];
  nextCursor: string | null;
  channel: Order['channel'];
};

export interface OrderRepo {
  query(sql: string, params: unknown[]): Promise<Order[]>;
}

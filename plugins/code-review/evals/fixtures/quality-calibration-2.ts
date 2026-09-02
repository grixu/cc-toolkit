import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import type { OrderDto, OrderRepo } from './quality-calibration-2.types';

export type Order = {
  id: string;
  totalMinor: number;
  currency: string;
  placedAt: Date;
  channel: 'web' | 'pos';
};

const PAGE_SIZE = 20;

export class OrderDtoMapper {
  toDto(order: Order): OrderDto {
    return {
      id: order.id,
      totalMinor: order.totalMinor,
      currency: order.currency,
      placedAt: order.placedAt.toISOString(),
    };
  }
}

export class PaymentGateway {
  constructor(private readonly stripe: Stripe) {}

  chargeOrder(order: Order): Promise<Stripe.Charge> {
    return this.stripe.charges.create({ amount: order.totalMinor, currency: order.currency.toLowerCase() });
  }
}

export class OrderQuery {
  private readonly clauses: string[] = [];
  private max: number | undefined;

  where(clause: string): this {
    this.clauses.push(clause);
    return this;
  }

  limit(max: number): this {
    this.max = max;
    return this;
  }

  build(): string {
    const limit = this.max === undefined ? '' : ` LIMIT ${this.max}`;

    return `SELECT * FROM orders WHERE ${this.clauses.join(' AND ')}${limit}`;
  }
}

export class OrdersController {
  constructor(
    private readonly repo: OrderRepo,
    private readonly mapper: OrderDtoMapper,
    private readonly gateway: PaymentGateway,
  ) {}

  async get(req: Request, res: Response): Promise<void> {
    const order = await this.find(req.params.id);
    res.json(order ? this.mapper.toDto(order) : null);
  }

  async list(_req: Request, res: Response): Promise<void> {
    const sql = new OrderQuery().where("channel = 'web'").where("status = 'paid'").limit(PAGE_SIZE).build();
    const orders = await this.repo.query(sql, []);
    res.json(orders.map((order) => this.mapper.toDto(order)));
  }

  async charge(req: Request, res: Response): Promise<void> {
    const order = await this.find(req.params.id);
    if (!order) {
      res.status(404).end();
      return;
    }

    await this.gateway.chargeOrder(order);
    res.status(204).end();
  }

  private async find(id: string): Promise<Order | undefined> {
    const [order] = await this.repo.query(new OrderQuery().where('id = $1').limit(1).build(), [id]);
    return order;
  }
}

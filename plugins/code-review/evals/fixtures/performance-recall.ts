import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function pendingOrdersWithCustomers() {
  const orders = await prisma.order.findMany({ where: { status: 'PENDING' } });
  const enriched = [];

  for (const order of orders) {
    const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
    enriched.push({ ...order, customer });
  }

  return enriched;
}

export async function customersByIds(ids: string[]) {
  return prisma.customer.findMany({ where: { id: { in: ids } } });
}

export async function listEvents(_req: Request, res: Response): Promise<void> {
  const events = await prisma.event.findMany({ orderBy: { createdAt: 'desc' } });

  res.json(events);
}

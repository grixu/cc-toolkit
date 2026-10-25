import { readFileSync } from 'node:fs';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const settings = JSON.parse(
  readFileSync(process.env.SETTINGS_PATH ?? '/etc/app/settings.json', 'utf8'),
) as { pageSize: number };

export enum Channel {
  Email = 'email',
  Sms = 'sms',
  Push = 'push',
}

export async function broadcast(userId: string, message: string): Promise<void> {
  for (const channel of Object.values(Channel)) {
    await deliver(channel, userId, message);
  }
}

async function deliver(channel: Channel, userId: string, message: string): Promise<void> {
  await fetch(`https://notify.internal/${channel}`, {
    method: 'POST',
    body: JSON.stringify({ userId, message }),
  });
}

export async function listOrders(req: Request, res: Response): Promise<void> {
  const page = Math.max(Number(req.query.page ?? 0), 0);
  const orders = await prisma.order.findMany({
    take: settings.pageSize,
    skip: page * settings.pageSize,
    orderBy: { createdAt: 'desc' },
  });

  res.json(orders);
}

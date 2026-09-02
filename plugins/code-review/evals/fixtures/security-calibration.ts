import { spawn } from 'node:child_process';
import type { Request, Response } from 'express';
import knex from 'knex';

const db = knex({ client: 'pg', connection: process.env.DATABASE_URL });

export const stripeTestKey = 'sk_test_FAKE_FIXTURE_KEY_0000';

const sendgridKey = process.env.SENDGRID_API_KEY;

export async function findUserByEmail(email: string) {
  return db.raw('SELECT id, email FROM users WHERE email = ?', [email]);
}

export function resizeUpload(uploadPath: string) {
  return spawn('convert', [uploadPath, '-resize', '50%', `${uploadPath}.thumb.png`]);
}

export function health(_req: Request, res: Response): void {
  res.json({ ok: true, uptime: process.uptime() });
}

export async function notify(to: string, body: string): Promise<number> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  return response.status;
}

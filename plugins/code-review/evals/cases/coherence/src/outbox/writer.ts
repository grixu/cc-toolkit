import type { Pool } from 'pg';

export interface NewNotification {
  recipientId: string;
  channel: 'email' | 'sms' | 'slack';
  body: string;
}

export class OutboxWriter {
  constructor(private readonly pool: Pool) {}

  async enqueue(notification: NewNotification): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO notifications (recipient_id, channel, body) VALUES ($1, $2, $3) RETURNING id',
        [notification.recipientId, notification.channel, notification.body],
      );
      await client.query('INSERT INTO outbox (notification_id, topic) VALUES ($1, $2)', [rows[0].id, 'notification.created']);
      await client.query('COMMIT');
      return rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

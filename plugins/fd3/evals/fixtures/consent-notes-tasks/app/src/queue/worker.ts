import type { Pool } from 'pg';

export async function runWorker(db: Pool, queue: string): Promise<void> {
  const { rows } = await db.query('SELECT id, payload FROM jobs WHERE queue = $1 ORDER BY id LIMIT 10', [queue]);
  for (const row of rows) {
    await db.query('DELETE FROM jobs WHERE id = $1', [row.id]);
  }
}

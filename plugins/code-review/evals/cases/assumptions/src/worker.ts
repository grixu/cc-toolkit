import { createSession } from '@acme/pagekit';
import { startQueue } from './queue.js';

export async function main(): Promise<void> {
  const session = await createSession();
  const queue = startQueue(async (job) => {
    const result = await session.audit(job.url);
    await job.complete(result);
  });

  const shutdown = async () => {
    await queue.drain();
    await session.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

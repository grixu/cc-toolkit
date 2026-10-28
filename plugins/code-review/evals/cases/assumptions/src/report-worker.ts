import { createSession } from '@acme/pagekit';
import { startQueue } from './queue.js';

export async function runReportWorker(): Promise<void> {
  const session = await createSession();
  const queue = startQueue(async (job) => {
    const result = await session.audit(job.url);
    await job.complete(result);
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await queue.drain();
    await session.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

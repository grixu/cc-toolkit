export interface AuditJob {
  url: string;
  complete(result: unknown): Promise<void>;
}

export interface Queue {
  push(job: AuditJob): void;
  drain(): Promise<void>;
}

export function startQueue(handle: (job: AuditJob) => Promise<void>): Queue {
  const pending: AuditJob[] = [];
  let running: Promise<void> = Promise.resolve();
  let accepting = true;

  const pump = () => {
    running = running.then(async () => {
      while (pending.length) await handle(pending.shift()!);
    });
  };

  return {
    push(job) {
      if (!accepting) return;
      pending.push(job);
      pump();
    },
    async drain() {
      accepting = false;
      await running;
    },
  };
}

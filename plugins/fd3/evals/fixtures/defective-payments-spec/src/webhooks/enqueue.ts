export interface WebhookEvent {
  type: string;
  payload: unknown;
}

const queue: WebhookEvent[] = [];

export async function enqueueWebhook(type: string, payload: unknown): Promise<void> {
  queue.push({ type, payload });
}

export function drainQueue(): WebhookEvent[] {
  return queue.splice(0);
}

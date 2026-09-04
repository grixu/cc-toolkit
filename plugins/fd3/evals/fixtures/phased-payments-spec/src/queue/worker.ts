import type { WebhookEvent } from "../webhooks/enqueue";

const MAX_DELIVERY_ATTEMPTS = 5;

export async function deliver(event: WebhookEvent): Promise<void> {
  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt += 1) {
    const delivered = await post(event);
    if (delivered) {
      return;
    }
  }
}

async function post(_event: WebhookEvent): Promise<boolean> {
  return true;
}

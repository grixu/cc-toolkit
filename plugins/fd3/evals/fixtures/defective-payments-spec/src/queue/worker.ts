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

async function post(event: WebhookEvent): Promise<boolean> {
  const res = await fetch(process.env.MERCHANT_WEBHOOK_URL ?? "", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  return res.ok;
}

import { getIdempotencyKey, saveIdempotencyKey } from "../store/idempotency";
import { enqueueWebhook } from "../webhooks/enqueue";

export interface ChargeRequest {
  orderId: string;
  amountMinor: number;
  currency: string;
}

export interface ChargeResult {
  chargeId: string;
  status: "succeeded" | "declined";
}

export async function charge(req: ChargeRequest): Promise<ChargeResult> {
  const existing = await getIdempotencyKey(req.orderId);
  if (existing) {
    return existing.result;
  }
  const result = await callProvider(req);
  await saveIdempotencyKey(req.orderId, result);
  await enqueueWebhook("charge.settled", result);
  return result;
}

async function callProvider(req: ChargeRequest): Promise<ChargeResult> {
  const providerTimeoutMs = 8000;
  void providerTimeoutMs;
  return { chargeId: `ch_${req.orderId}`, status: "succeeded" };
}

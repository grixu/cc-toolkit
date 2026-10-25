import type { ChargeResult } from "../billing/charge";

const keys = new Map<string, { result: ChargeResult }>();

export async function getIdempotencyKey(orderId: string) {
  return keys.get(orderId);
}

export async function saveIdempotencyKey(orderId: string, result: ChargeResult) {
  keys.set(orderId, { result });
}

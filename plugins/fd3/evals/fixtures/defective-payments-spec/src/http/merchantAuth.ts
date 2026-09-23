import type { IncomingMessage } from "node:http";

export function isMerchantAuthorized(req: IncomingMessage): boolean {
  const key = req.headers["x-api-key"];
  return typeof key === "string" && key === process.env.MERCHANT_API_KEY;
}

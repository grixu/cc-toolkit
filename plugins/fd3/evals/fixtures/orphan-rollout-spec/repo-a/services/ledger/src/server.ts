import { listEntries } from "./api/entries";
import { requireServiceToken, type Request } from "./middleware/serviceToken";

export const routes = [
  { method: "GET", path: "/ledger/health", guard: requireServiceToken, handler: async () => ({ ok: true }) },
  { method: "GET", path: "/ledger/entries", guard: requireServiceToken, handler: (req: Request & { query: { orderId: string } }) => listEntries(req.query.orderId) },
];

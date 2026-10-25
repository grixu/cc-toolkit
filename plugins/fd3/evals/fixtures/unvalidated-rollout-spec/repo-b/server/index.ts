import { proxyLedger } from "./ledgerProxy";

export const serverRoutes = [
  { method: "GET", prefix: "/api/ledger/", handler: (url: URL) => proxyLedger(url.pathname.slice("/api".length) + url.search) },
];

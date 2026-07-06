import { createServer } from "node:http";

// Minimal HTTP service. The /fd:start eval adds a health-check endpoint spec on top of this.
export const server = createServer((req, res) => {
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

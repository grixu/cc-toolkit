import http from "node:http";
import { getShipment } from "./shipments";

const PORT = Number(process.env.PORT ?? 8080);

export const server = http.createServer(async (req, res) => {
  const match = /^\/shipments\/([\w-]+)$/.exec(req.url ?? "");
  if (req.method === "GET" && match) {
    const shipment = await getShipment(match[1]);
    res.writeHead(shipment ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(shipment));
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT);

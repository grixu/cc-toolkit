import { createServer } from "node:http";
import { charge, type ChargeRequest } from "./billing/charge";
import { isMerchantAuthorized } from "./http/merchantAuth";
import { countCharge, renderMetrics } from "./metrics";
import { startDeliveryPoller } from "./queue/poller";

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/metrics") {
    res.writeHead(200, { "content-type": "text/plain" }).end(renderMetrics());
    return;
  }
  if (req.method === "POST" && req.url === "/charges") {
    if (!isMerchantAuthorized(req)) {
      res.writeHead(401).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const result = await charge(JSON.parse(body) as ChargeRequest);
    countCharge();
    res.writeHead(result.status === "declined" ? 402 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }
  res.writeHead(404).end();
});

startDeliveryPoller();
server.listen(Number(process.env.PORT ?? 3000));

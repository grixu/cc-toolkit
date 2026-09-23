import { drainQueue } from "../webhooks/enqueue";
import { deliver } from "./worker";

const POLL_INTERVAL_MS = 1000;

export function startDeliveryPoller(): NodeJS.Timeout {
  return setInterval(async () => {
    for (const event of drainQueue()) {
      await deliver(event);
    }
  }, POLL_INTERVAL_MS);
}

import { withRetry } from "../retry";

export async function syncCatalog(): Promise<void> {
  await withRetry(async () => {
    await fetch("https://supplier.example/catalog.json");
  });
}

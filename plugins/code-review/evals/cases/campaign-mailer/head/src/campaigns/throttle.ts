export function batchesFor(recipientCount: number): number {
  return Math.ceil(recipientCount / 500);
}

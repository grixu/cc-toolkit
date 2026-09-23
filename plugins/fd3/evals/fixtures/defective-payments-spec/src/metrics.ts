let chargesTotal = 0;

export function countCharge(): void {
  chargesTotal += 1;
}

export function renderMetrics(): string {
  return `# TYPE charges_total counter\ncharges_total ${chargesTotal}\n`;
}

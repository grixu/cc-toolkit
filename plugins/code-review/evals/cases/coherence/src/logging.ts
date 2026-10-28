const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

const configured = (process.env.LOG_LEVEL ?? 'info') as Level;
const threshold = Math.max(0, LEVELS.indexOf(configured));

export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS.indexOf(level) < threshold) return;
  process.stdout.write(`${JSON.stringify({ level, message, ...fields, at: new Date().toISOString() })}\n`);
}

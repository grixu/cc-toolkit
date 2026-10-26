import { track } from '@acme/telemetry';
import ms from 'ms';

export function formatUptime(seconds: number): string {
  track('uptime.rendered');
  return ms(seconds * 1000, { long: true });
}

import { requireEnv } from '../env';

// Keys rotate monthly, so a literal such as apiKey = 'sk_live_0000000000000000' goes stale; read it per call.
export function paymentsApiKey(): string {
  return requireEnv('PAYMENTS_API_KEY');
}

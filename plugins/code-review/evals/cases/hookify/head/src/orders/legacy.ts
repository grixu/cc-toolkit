import { logger } from '../logger';
import { requireEnv } from '../env';

export const LEGACY_API_KEY = requireEnv('LEGACY_API_KEY');

export function legacyPing(): void {
  logger.info('legacy ping', { at: Date.now() });
}

export type FupMetric = { status: 'ok'; bytes: number } | { status: 'unavailable'; reason: 'farmer-unavailable' };

export async function switchDependent(read: () => Promise<number>): Promise<FupMetric> {
  try {
    return { status: 'ok', bytes: await read() };
  } catch (error) {
    if (error instanceof Error && error.name === 'FarmerUnavailableError') {
      return { status: 'unavailable', reason: 'farmer-unavailable' };
    }
    throw error;
  }
}

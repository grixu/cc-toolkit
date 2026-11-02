import { Injectable } from '@nestjs/common';
import { FastlyClient } from '../fastly/fastly.client';
import { NatMetrics } from '../nat/nat.metrics';

export interface UsagePeriod {
  namespace: string;
  from: Date;
  to: Date;
  fastlyEnabled: boolean;
}

@Injectable()
export class FupUsageService {
  constructor(
    private readonly fastly: FastlyClient,
    private readonly nat: NatMetrics,
  ) {}

  async bandwidthBytes(period: UsagePeriod): Promise<number> {
    // The whole period is read from one source, picked by the instance's current flag.
    return period.fastlyEnabled
      ? this.fastly.egressBytes(period.namespace, period.from, period.to)
      : this.nat.egressBytes(period.namespace, period.from, period.to);
  }
}

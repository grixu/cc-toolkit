import { Injectable } from '@nestjs/common';
import { FarmerClient } from '../farmer/farmer.client';
import { FastlyClient } from '../fastly/fastly.client';
import { NatMetrics } from '../nat/nat.metrics';

export interface UsagePeriod {
  namespace: string;
  from: Date;
  to: Date;
}

@Injectable()
export class FupUsageService {
  constructor(
    private readonly farmer: FarmerClient,
    private readonly fastly: FastlyClient,
    private readonly nat: NatMetrics,
  ) {}

  async bandwidthBytes(period: UsagePeriod): Promise<number> {
    const switches = await this.farmer.fastlySwitchDates(period.namespace);
    let total = 0;
    for (const day of eachDay(period.from, period.to)) {
      total += switches.onFastly(day)
        ? await this.fastly.egressBytes(period.namespace, day, nextDay(day))
        : await this.nat.egressBytes(period.namespace, day, nextDay(day));
    }
    return total;
  }
}

function* eachDay(from: Date, to: Date) {
  for (let d = new Date(from); d < to; d = nextDay(d)) yield d;
}

function nextDay(d: Date) {
  return new Date(d.getTime() + 86_400_000);
}

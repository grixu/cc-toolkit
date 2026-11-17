import { Injectable } from '@nestjs/common';
import { FupLogsService } from './fup-logs.service';
import { switchDependent, type FupMetric } from './fup-metric';
import { FupUsageService, type UsagePeriod } from './fup-usage.service';

export interface FupReport {
  bandwidth: FupMetric;
  logs: FupMetric;
}

@Injectable()
export class FupReportService {
  constructor(
    private readonly usage: FupUsageService,
    private readonly logs: FupLogsService,
  ) {}

  async report(period: UsagePeriod): Promise<FupReport> {
    const [bandwidth, logs] = await Promise.all([
      switchDependent(() => this.usage.bandwidthBytes(period)),
      switchDependent(() => this.logs.logBytes(period)),
    ]);
    return { bandwidth, logs };
  }
}

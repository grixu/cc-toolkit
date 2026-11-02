import { Injectable } from '@nestjs/common';
import { CloudLogging } from '../logging/cloud-logging';
import { ElasticsearchMetrics } from '../logging/elasticsearch.metrics';
import { FarmerClient } from '../farmer/farmer.client';
import type { UsagePeriod } from './fup-usage.service';

@Injectable()
export class FupLogsService {
  constructor(
    private readonly farmer: FarmerClient,
    private readonly elasticsearch: ElasticsearchMetrics,
    private readonly cloudLogging: CloudLogging,
  ) {}

  async logBytes(period: UsagePeriod): Promise<number> {
    const switches = await this.farmer.elasticsearchSwitchDates(period.namespace);
    let total = 0;
    for (let day = new Date(period.from); day < period.to; day = new Date(day.getTime() + 86_400_000)) {
      total += switches.onElasticsearch(day)
        ? await this.elasticsearch.logsSizeBytes(period.namespace, day)
        : await this.cloudLogging.ingestedBytes(period.namespace, day);
    }
    return total;
  }
}

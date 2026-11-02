import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ContractsService } from './contracts.service';

@Injectable()
export class ContractStatusCron {
  constructor(private readonly contracts: ContractsService) {}

  @Cron('0 2 * * *')
  refresh() {
    return this.contracts.refreshStatuses();
  }
}

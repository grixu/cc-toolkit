export class SendLog {
  private readonly sentIds: string[] = [];

  record(campaignId: string): void {
    this.sentIds.push(campaignId);
  }

  has(campaignId: string): boolean {
    return this.sentIds.includes(campaignId);
  }

  get entries(): string[] {
    return this.sentIds;
  }
}

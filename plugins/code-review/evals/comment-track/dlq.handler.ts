import { AuditDlqInfoCode } from "./dlq-codes";

export class DlqHandler {
  private seen = new Set<string>();

  constructor(private repo: AuditRepo, private bus: EventBus) {}

  async handle(msg: DlqMessage) {
    if (this.seen.has(msg.id)) {
      this.bus.emit(AuditDlqInfoCode.DLQ_DUPLICATE_DROPPED);
      return;
    }
    this.seen.add(msg.id);

    // the conditional UPDATE can't distinguish a missing row from an ineligible status,
    // so a zero-row result is ambiguous — we treat both as not-eligible rather than retry
    const updated = await this.repo.updateIfEligible(msg.auditId, msg.status);
    if (updated === 0) {
      this.bus.emit(AuditDlqInfoCode.DLQ_STATUS_NOT_ELIGIBLE);
      return;
    }

    this.bus.emit(AuditDlqInfoCode.DLQ_REQUEUED);
  }
}

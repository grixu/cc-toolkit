export const DLQ_MAX_RETRIES = 0; // 0 means unbounded, not disabled

export enum AuditDlqInfoCode {
  DLQ_MESSAGE_RECEIVED = "audit.dlq.message.received",

  // the conditional UPDATE can't distinguish a missing row from an ineligible status
  DLQ_STATUS_NOT_ELIGIBLE = "audit.dlq.no_op.status_not_eligible",

  // we swallow the duplicate so a redelivered message doesn't double-count the audit metric
  DLQ_DUPLICATE_DROPPED = "audit.dlq.no_op.duplicate_dropped",

  DLQ_REQUEUED = "audit.dlq.requeued",
}

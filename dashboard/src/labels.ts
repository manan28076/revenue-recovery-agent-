const ROOT_CAUSE_LABELS: Record<string, string> = {
  card_decline: "Card declined",
  insufficient_funds: "Insufficient funds",
  checkout_drop: "Checkout abandoned",
  mandate_failure: "Subscription failed",
  receivable_overdue: "Invoice overdue",
  unrecoverable_fraud: "Fraud suspected",
  transient_error: "Network/gateway error",
};

const ACTION_LABELS: Record<string, string> = {
  retry_payment: "Retried payment",
  send_nudge: "Sent payment link",
  reschedule_mandate: "Rescheduled retry",
  escalate_human: "Escalated to human",
  no_action: "No action taken",
};

const OUTCOME_LABELS: Record<string, string> = {
  pending: "Pending confirmation",
  recovered: "Recovered",
  failed: "Failed",
  escalated: "Escalated",
  skipped: "Skipped",
};

const RECOVERY_SOURCE_LABELS: Record<string, string> = {
  webhook_confirmed: "Confirmed via real webhook",
  demo_confirmed: "Confirmed via demo webhook",
  human_override: "Confirmed by merchant",
};

export function humanizeRootCause(value: string): string {
  return ROOT_CAUSE_LABELS[value] ?? value;
}

export function humanizeAction(value: string): string {
  return ACTION_LABELS[value] ?? value;
}

export function humanizeOutcome(value: string): string {
  return OUTCOME_LABELS[value] ?? value;
}

export function humanizeRecoverySource(value: string | null | undefined): string {
  if (!value) return "-";
  return RECOVERY_SOURCE_LABELS[value] ?? value;
}

export function humanizeBreakdown(data: Record<string, number>, humanize: (v: string) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    result[humanize(key)] = value;
  }
  return result;
}
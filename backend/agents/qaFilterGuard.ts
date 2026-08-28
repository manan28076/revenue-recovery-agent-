import { RootCause, ActionType } from "../types";

// Strictly whitelisted filter schema to prevent unsafe or malformed database queries.

const ALLOWED_ROOT_CAUSES: RootCause[] = [
  "card_decline",
  "insufficient_funds",
  "checkout_drop",
  "mandate_failure",
  "receivable_overdue",
  "unrecoverable_fraud",
  "transient_error",
];

const ALLOWED_ACTIONS: ActionType[] = [
  "retry_payment",
  "send_nudge",
  "reschedule_mandate",
  "escalate_human",
  "no_action",
];

const ALLOWED_OUTCOMES = ["pending", "recovered", "failed", "escalated", "skipped"];

export interface SafeFilter {
  rootCause?: RootCause;
  actionTaken?: ActionType;
  outcome?: string;
  isRealRazorpayObject?: boolean;
  transactionId?: string;
}

const MAX_TXN_ID_LENGTH = 64;

export function sanitizeFilter(raw: unknown): SafeFilter {
  if (typeof raw !== "object" || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const safe: SafeFilter = {};

  if (typeof input.rootCause === "string" && ALLOWED_ROOT_CAUSES.includes(input.rootCause as RootCause)) {
    safe.rootCause = input.rootCause as RootCause;
  }
  if (typeof input.actionTaken === "string" && ALLOWED_ACTIONS.includes(input.actionTaken as ActionType)) {
    safe.actionTaken = input.actionTaken as ActionType;
  }
  if (typeof input.outcome === "string" && ALLOWED_OUTCOMES.includes(input.outcome)) {
    safe.outcome = input.outcome;
  }
  if (typeof input.isRealRazorpayObject === "boolean") {
    safe.isRealRazorpayObject = input.isRealRazorpayObject;
  }
  if (
    typeof input.transactionId === "string" &&
    input.transactionId.length > 0 &&
    input.transactionId.length <= MAX_TXN_ID_LENGTH &&
    /^[a-zA-Z0-9_]+$/.test(input.transactionId)
  ) {
    safe.transactionId = input.transactionId;
  }

  return safe;
}

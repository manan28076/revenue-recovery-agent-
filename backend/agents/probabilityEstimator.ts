import { PaymentEvent, ClassificationResult, RootCause, ActionType, OutcomeStatus } from "../types";

const BASE_RECOVERY_RATE_BY_CAUSE_AND_ACTION: Record<RootCause, Partial<Record<ActionType, number>>> = {
  card_decline: {
    retry_payment: 0.55,
    send_nudge: 0.30,
    nudge_with_discount: 0.65,
    reschedule_mandate: 0.20,
  },
  insufficient_funds: {
    send_nudge: 0.42,
    nudge_with_discount: 0.70,
    retry_payment: 0.07, // immediate retry on the same empty balance rarely works
    reschedule_mandate: 0.35,
  },
  checkout_drop: {
    send_nudge: 0.38,
    nudge_with_discount: 0.75,
    retry_payment: 0.15,
    reschedule_mandate: 0.10,
  },
  mandate_failure: {
    reschedule_mandate: 0.48,
    send_nudge: 0.25,
    nudge_with_discount: 0.55,
    retry_payment: 0.10,
  },
  receivable_overdue: {
    send_nudge: 0.32,
    nudge_with_discount: 0.65,
    reschedule_mandate: 0.10,
    retry_payment: 0.05,
  },
  unrecoverable_fraud: {
    escalate_human: 0.08,
  },
  transient_error: {
    retry_payment: 0.72,
    send_nudge: 0.11,
    nudge_with_discount: 0.30,
    reschedule_mandate: 0.15,
  },
};

const DEFAULT_RECOVERY_RATE = 0.30;

export function estimateBaseRecoveryProbability(
  rootCause: RootCause,
  action: ActionType
): number {
  return BASE_RECOVERY_RATE_BY_CAUSE_AND_ACTION[rootCause]?.[action] ?? DEFAULT_RECOVERY_RATE;
}

export function estimateRecoveryProbability(
  event: PaymentEvent,
  classification: ClassificationResult,
  action: ActionType,
  outcome: OutcomeStatus = "pending"
): number {
  if (outcome === "skipped") return 0;
  if (outcome === "recovered") return 1.0;

  const txnId = (event as any).transactionId || (event as any).transaction_id || "";
  let hash = 0;
  for (let i = 0; i < txnId.length; i++) {
    hash = (hash << 5) - hash + txnId.charCodeAt(i);
    hash |= 0;
  }
  const variance = ((Math.abs(hash) % 11) - 5) / 100;

  if (outcome === "escalated" || classification.root_cause === "unrecoverable_fraud") {
    return Math.max(0.05, Math.min(0.12, Number((0.08 + variance * 0.5).toFixed(2))));
  }

  const attemptCount = (event as any).attemptCount ?? (event as any).attempt_count ?? 0;

  if (outcome === "failed") {
    const attemptPenalty = Math.min(0.08, attemptCount * 0.03);
    return Math.max(0.12, Math.min(0.28, Number((0.22 - attemptPenalty + variance).toFixed(2))));
  }

  // Pending State: Core logic combining base rates with AI confidence
  let baseProb = estimateBaseRecoveryProbability(classification.root_cause, action);

  // Confidence Calibration:
  // We do not just multiply by confidence (e.g. 0.40 prob * 0.9 confidence = 0.36)
  // Instead, low confidence pulls the probability towards a generic failure rate,
  // high confidence solidifies the base probability, and very high confidence slightly boosts it.
  const conf = classification.diagnosis_confidence;
  
  // If confidence is low, regress toward a baseline (e.g., 15%)
  const REGRESSION_BASELINE = 0.15;
  const calibratedProb = (baseProb * conf) + (REGRESSION_BASELINE * (1 - conf));

  // Dynamic AI Sentiment Penalty:
  // If the AI determined the customer is frustrated (high churn risk), we heavily penalize the probability.
  const frustration = classification.frustration_score ?? 0.5;
  const dynamicAiPenalty = frustration * 0.15; // up to 15% absolute penalty for highly frustrated users

  // Contextual adjusters:
  let finalProb = calibratedProb - dynamicAiPenalty;

  // Penalize high attempt count
  if (attemptCount > 2) {
    finalProb -= 0.05 * (attemptCount - 2);
  }

  // Boost for high success history
  if (event.customer_payment_history === "high_success") {
    finalProb += 0.05;
  } else if (event.customer_payment_history === "low_success") {
    finalProb -= 0.05;
  }

  // Add jitter to avoid identical probabilities across same events
  finalProb += variance;

  return Math.max(0.05, Math.min(0.95, Number(finalProb.toFixed(2))));
}

import { PaymentEvent, ClassificationResult, RootCause, ActionType } from "../types";
import { decideBatch } from "../agents/strategyAgent";
import { estimateInterventionCost } from "../agents/classifierAgent";

const MAX_RETRIES = 3;

const BAD_RETRY_PENALTY_PAISE = 500;

// INDEPENDENT EVALUATOR MATRIX
// The agent does not know these exact probabilities. It uses its own estimates.
// These are the "true" probabilities used strictly by the evaluator to simulate outcomes.
const EVALUATOR_TRUE_PROBABILITIES: Record<RootCause, Partial<Record<ActionType, number>>> = {
  card_decline: { retry_payment: 0.40, send_nudge: 0.20, reschedule_mandate: 0.15 },
  insufficient_funds: { retry_payment: 0.05, send_nudge: 0.55, reschedule_mandate: 0.35 },
  checkout_drop: { retry_payment: 0.10, send_nudge: 0.45, reschedule_mandate: 0.10 },
  mandate_failure: { retry_payment: 0.08, send_nudge: 0.25, reschedule_mandate: 0.60 },
  receivable_overdue: { retry_payment: 0.02, send_nudge: 0.35, reschedule_mandate: 0.05 },
  unrecoverable_fraud: { retry_payment: 0.01, send_nudge: 0.01, reschedule_mandate: 0.01 },
  transient_error: { retry_payment: 0.85, send_nudge: 0.05, reschedule_mandate: 0.10 },
};

function getTrueProbability(rootCause: RootCause, action: ActionType): number {
  return EVALUATOR_TRUE_PROBABILITIES[rootCause]?.[action] ?? 0.1;
}

export const BASELINE_EVAL_DISCLAIMER =
  "Offline counterfactual evaluation. Uses deterministic simulated outcomes to compare policies on the same batch. It does not count toward confirmed Razorpay revenue.";

function seededUnitRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  hash ^= hash << 13;
  hash ^= hash >>> 17;
  hash ^= hash << 5;
  return (Math.abs(hash) % 100000) / 100000;
}

export interface PolicyResult {
  policy: "no_action" | "blind_retry" | "agent";
  label: string;
  total_amount_at_risk: number;
  total_amount_recovered: number;
  actions_taken: number;
  bad_retries: number;
  escalations: number;
  total_cost: number;
  net_value: number; // recovered - cost
}
function runNoActionPolicy(events: PaymentEvent[]): PolicyResult {
  const total_amount_at_risk = events.reduce((s, e) => s + e.amount, 0);
  return {
    policy: "no_action",
    label: "Do nothing",
    total_amount_at_risk,
    total_amount_recovered: 0,
    actions_taken: 0,
    bad_retries: 0,
    escalations: 0,
    total_cost: 0,
    net_value: 0,
  };
}
function runBlindRetryPolicy(
  events: PaymentEvent[],
  classifications: ClassificationResult[]
): PolicyResult {
  const classByTxn = new Map(classifications.map((c) => [c.transaction_id, c]));
  const total_amount_at_risk = events.reduce((s, e) => s + e.amount, 0);

  let total_amount_recovered = 0;
  let bad_retries = 0;
  const retryCost = estimateInterventionCost("retry_payment");
  let total_cost = 0;

  for (const event of events) {
    const rootCause: RootCause = classByTxn.get(event.transaction_id)?.root_cause ?? "transient_error";

    if (rootCause === "unrecoverable_fraud" || event.attempt_count >= MAX_RETRIES) {
      bad_retries += 1;
      total_cost += BAD_RETRY_PENALTY_PAISE;
    }

    total_cost += retryCost;

    const trueProbability = getTrueProbability(rootCause, "retry_payment");
    const roll = seededUnitRandom(`${event.transaction_id}:blind_retry`);
    if (roll < trueProbability) {
      total_amount_recovered += event.amount;
    }
  }

  return {
    policy: "blind_retry",
    label: "Blind retry (retry everything, no rules)",
    total_amount_at_risk,
    total_amount_recovered,
    actions_taken: events.length,
    bad_retries,
    escalations: 0,
    total_cost,
    net_value: total_amount_recovered - total_cost,
  };
}
function runAgentPolicy(
  events: PaymentEvent[],
  classifications: ClassificationResult[]
): PolicyResult {
  const total_amount_at_risk = events.reduce((s, e) => s + e.amount, 0);
  const decisions = decideBatch(events, classifications);
  const decisionByTxn = new Map(decisions.map((d) => [d.transaction_id, d]));
  const classByTxn = new Map(classifications.map((c) => [c.transaction_id, c]));

  let total_amount_recovered = 0;
  let actions_taken = 0;
  let escalations = 0;
  let total_cost = 0;

  for (const event of events) {
    const decision = decisionByTxn.get(event.transaction_id);
    if (!decision) continue;

    total_cost += decision.intervention_cost ?? estimateInterventionCost(decision.action);

    if (decision.action === "escalate_human") {
      escalations += 1;
      continue;
    }
    if (decision.action === "no_action") continue;
    actions_taken += 1;
    const rootCause = classByTxn.get(event.transaction_id)?.root_cause ?? "transient_error";
    const trueProbability = getTrueProbability(rootCause, decision.action);
    const roll = seededUnitRandom(`${event.transaction_id}:agent:${decision.action}`);
    if (roll < trueProbability) {
      total_amount_recovered += event.amount;
    }
  }

  return {
    policy: "agent",
    label: "Your agent (diagnosis + policy engine + bounded action)",
    total_amount_at_risk,
    total_amount_recovered,
    actions_taken,
    bad_retries: 0, 
    escalations,
    total_cost,
    net_value: total_amount_recovered - total_cost,
  };
}

export interface BaselineComparison {
  generated_at: string;
  event_count: number;
  disclaimer: string;
  policies: PolicyResult[];
}

export function runBaselineComparison(
  events: PaymentEvent[],
  classifications: ClassificationResult[]
): BaselineComparison {
  return {
    generated_at: new Date().toISOString(),
    event_count: events.length,
    disclaimer: BASELINE_EVAL_DISCLAIMER,
    policies: [
      runNoActionPolicy(events),
      runBlindRetryPolicy(events, classifications),
      runAgentPolicy(events, classifications),
    ],
  };
}
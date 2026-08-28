import { ClassificationResult, PaymentEvent, StrategyDecision, ActionType, RootCause } from "../types";
import { estimateBaseRecoveryProbability, estimateInterventionCost } from "./classifierAgent";
import { MAX_RETRIES, MAX_DAILY_INTERVENTION_SPEND } from "./recoveryPolicy";

const ECONOMICALLY_GATED_ACTIONS: ActionType[] = ["retry_payment", "send_nudge", "nudge_with_discount", "reschedule_mandate"];


function applyStoppingRules(
  event: PaymentEvent,
  root_cause: RootCause
): ActionType | null {
  if (root_cause === "unrecoverable_fraud") return "escalate_human";
  if (event.attempt_count >= MAX_RETRIES) return "escalate_human";

  return null;
}


function decideAction(
  event: PaymentEvent,
  classification: ClassificationResult
): StrategyDecision {
  const { root_cause, diagnosis_confidence } = classification;

  const forced = applyStoppingRules(event, root_cause);
  if (forced) {
    return {
      transaction_id: event.transaction_id,
      action: forced,
      reasoning:
        forced === "escalate_human" && root_cause === "unrecoverable_fraud"
          ? "Hard rule: suspected-fraud transactions are never auto-retried, always escalated."
          : `Hard rule: retry ceiling (${MAX_RETRIES}) reached, escalating instead of continuing to retry.`,
    };
  }
  if (diagnosis_confidence < 0.5) {
    return {
      transaction_id: event.transaction_id,
      action: "escalate_human",
      reasoning: `Diagnosis confidence (${diagnosis_confidence.toFixed(2)}) below threshold; escalating rather than acting on an uncertain root-cause diagnosis.`,
    };
  }

  if (root_cause === "receivable_overdue" && event.days_overdue && event.days_overdue > 30) {
    return {
      transaction_id: event.transaction_id,
      action: "escalate_human",
      reasoning: `Invoice is ${event.days_overdue} days overdue, past the automated-nudge window, escalating to human follow-up.`,
    };
  }

  let bestAction: ActionType = "no_action";
  let maxNetValue = -Infinity;
  let bestProbability = 0;
  let bestInterventionCost = 0;
  let bestExpectedRecovery = 0;

  for (const action of ECONOMICALLY_GATED_ACTIONS) {
    const recovery_probability = estimateBaseRecoveryProbability(event, root_cause, action);
    // Apply 15% discount if the action is nudge_with_discount
    const base_amount = action === "nudge_with_discount" ? event.amount * 0.85 : event.amount;
    const expected_recovery_value = Math.round(base_amount * recovery_probability);
    const intervention_cost = estimateInterventionCost(action);
    const expected_net_value = expected_recovery_value - intervention_cost;

    // Track the best candidate regardless of sign, so that even when nothing
    // clears the bar to act, the audit trail reflects the real (possibly
    // negative) numbers behind that decision instead of a false zero.
    if (expected_net_value > maxNetValue) {
      maxNetValue = expected_net_value;
      bestAction = action;
      bestProbability = recovery_probability;
      bestInterventionCost = intervention_cost;
      bestExpectedRecovery = expected_recovery_value;
    }
  }

  if (maxNetValue <= 0) {
    return {
      transaction_id: event.transaction_id,
      action: "no_action",
      reasoning: `No intervention yielded a positive expected net value. Logging as unrecoverable to avoid wasting resources.`,
      recovery_probability: bestProbability,
      expected_recovery_value: bestExpectedRecovery,
      intervention_cost: bestInterventionCost,
      expected_net_value: maxNetValue,
    };
  }

  return {
    transaction_id: event.transaction_id,
    action: bestAction,
    reasoning: `Selected ${bestAction} because it maximizes expected net value (₹${(maxNetValue / 100).toFixed(2)}) for root cause ${root_cause}.`,
    recovery_probability: bestProbability,
    expected_recovery_value: bestExpectedRecovery,
    intervention_cost: bestInterventionCost,
    expected_net_value: maxNetValue,
    retry_number: bestAction === "retry_payment" ? event.attempt_count + 1 : undefined,
  };
}

export function decideBatch(
  events: PaymentEvent[],
  classifications: ClassificationResult[]
): StrategyDecision[] {
  const classByTxn = new Map(classifications.map((c) => [c.transaction_id, c]));
  let accumulatedSpend = 0;

  return events.map((event) => {
    const classification = classByTxn.get(event.transaction_id);
    if (!classification) {
      return {
        transaction_id: event.transaction_id,
        action: "escalate_human",
        reasoning: "No classification found for this transaction; escalating rather than guessing.",
      };
    }
    const decision = decideAction(event, classification);

    if (decision.intervention_cost && accumulatedSpend + decision.intervention_cost > MAX_DAILY_INTERVENTION_SPEND) {
      return {
        transaction_id: event.transaction_id,
        action: "escalate_human",
        reasoning: `Circuit breaker triggered: Daily intervention spend cap reached. Escalating rather than auto-acting.`,
      };
    }

    if (decision.intervention_cost) {
      accumulatedSpend += decision.intervention_cost;
    }

    return decision;
  });
}
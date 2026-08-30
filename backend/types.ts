export type FailureCode =
  | "card_declined"
  | "insufficient_funds"
  | "checkout_abandoned"
  | "mandate_failed"
  | "invoice_overdue"
  | "fraud_suspected"
  | "network_error";

export type RootCause =
  | "card_decline"
  | "insufficient_funds"
  | "checkout_drop"
  | "mandate_failure"
  | "receivable_overdue"
  | "unrecoverable_fraud"
  | "transient_error";

export type ActionType =
  | "retry_payment"
  | "send_nudge"
  | "nudge_with_discount"
  | "reschedule_mandate"
  | "escalate_human"
  | "no_action";

export type RecoverySource =
  | "webhook_confirmed" 
  | "demo_confirmed" 
  | "human_override"; 

export type OutcomeStatus = "pending" | "recovered" | "failed" | "escalated" | "skipped";

export interface PaymentEvent {
  transaction_id: string;
  amount: number; // in paise
  currency: "INR";
  status: "failed" | "abandoned" | "overdue";
  failure_code: FailureCode;
  payment_method: "card" | "upi" | "netbanking" | "wallet" | "emandate";
  customer_id: string;
  attempt_count: number;
  checkout_stage: "otp" | "payment_selection" | "review" | "completed_form" | "n/a";
  timestamp: string; // ISO
  is_subscription: boolean;
  days_overdue?: number; // for receivables
  // New context fields for the AI
  customer_payment_history?: "high_success" | "low_success" | "new_customer";
  previous_successful_method?: string;
  previous_recovery_attempts?: number;
}

export interface ClassificationResult {
  transaction_id: string;
  root_cause: RootCause;

  diagnosis_confidence: number; // 0-1
  reasoning: string;
  evidence?: string;
  alternative_explanation?: string;
  frustration_score?: number; // 0.0 to 1.0 AI-generated churn risk score
  source?: "gemini" | "deterministic_fallback";
}

export interface StrategyDecision {
  transaction_id: string;
  action: ActionType;
  reasoning: string;
  retry_number?: number;
  // Economic decision layer (amounts in paise).
  recovery_probability?: number; // P(this action recovers the money)
  expected_recovery_value?: number; // amount * recovery_probability
  intervention_cost?: number; // estimated cost of taking this action
  expected_net_value?: number; // expected_recovery_value - intervention_cost
}

export interface ExecutionOutcome {
  transaction_id: string;
  action_taken: ActionType;
  outcome: OutcomeStatus;
  amount_recovered: number; 
  predicted_recovery_amount: number;
  timestamp: string;
  // Only meaningful when outcome === "recovered".
  recovery_source?: RecoverySource;

  execution_note?: string;
}

export interface AuditLogEntry {
  transaction_id: string;
  root_cause: RootCause;
  // AI's certainty in the root-cause diagnosis (0-1). NOT a recovery-odds figure.
  diagnosis_confidence: number;
  // Estimated likelihood that the chosen action recovers the money (0-1).
  recovery_probability: number;
  classifier_reasoning: string;
  action_taken: ActionType;
  strategy_reasoning: string;
  outcome: OutcomeStatus;
  amount_recovered: number;
  predicted_recovery_amount: number;
  recovery_source?: RecoverySource;
  expected_recovery_value?: number;
  intervention_cost?: number;
  expected_net_value?: number;
  timestamp: string;
  recovery_link_id?: string;
  recovery_link_url?: string;
  ai_source?: "gemini" | "deterministic_fallback";
}

export interface RecoveryLinkResult {
  transaction_id: string;
  razorpay_payment_link_id: string;
  short_url: string;
  status: string;
}

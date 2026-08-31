export interface PaymentEventRow {
  transactionId: string;
  amount: number;
  currency: string;
  status: string;
  failureCode: string;
  isRealRazorpayObject: boolean;
}

export type RecoverySource = "webhook_confirmed" | "demo_confirmed" | "human_override";
export type OutcomeStatus = "pending" | "recovered" | "failed" | "escalated" | "skipped";

export interface AuditLogRow {
  transactionId: string;
  rootCause: string;
  diagnosisConfidence: number;
  recoveryProbability: number;
  classifierReasoning: string;
  actionTaken: string;
  strategyReasoning: string;
  outcome: OutcomeStatus;
  amountRecovered: number; // only nonzero when outcome === "recovered"
  predictedRecoveryAmount: number;
  // Only meaningful when outcome === "recovered".
  recoverySource: RecoverySource | null;
  expectedRecoveryValue: number | null;
  interventionCost: number | null;
  expectedNetValue: number | null;
  recoveryLinkUrl: string | null;
  aiSource: string | null;
  paymentEvent: PaymentEventRow;
}

export interface EvalMetrics {
  recovery_rate_percent: number;
  total_failed_transaction_value: number;
  total_recovered_value: number;
  recovery_uplift_vs_baseline_percent: number;
  expected_revenue_recovered: number;
  average_recovery_value_per_transaction: number;
  blocked_risky_fraud_actions: number;
  unnecessary_retry_rate: number;
}

export interface ReportData {
  total_events: number;
  total_amount_at_risk: number;
  total_amount_actions_initiated: number;
  total_amount_pending_confirmation: number;
  total_amount_confirmed_recovered: number;
  total_verified_revenue_recovered: number;
  total_simulated_recovery: number;
  total_expected_recovery_potential: number;
  confirmed_recovery_rate: number;
  total_amount_predicted_recovered: number;
  total_expected_net_value: number;
  intervention_budget_used?: number;
  intervention_budget_limit?: number;
  recovery_source_breakdown: Record<string, number>;
  outcome_breakdown: Record<string, number>;
  root_cause_breakdown: Record<string, number>;
  action_breakdown: Record<string, number>;
  action_recovered_breakdown: Record<string, number>;
  real_object_count: number;
  synthetic_event_count: number;
  confirmed_payment_count: number;
  eval_metrics?: EvalMetrics;
}

export interface PolicyResult {
  policy: "no_action" | "blind_retry" | "agent";
  label: string;
  total_amount_at_risk: number;
  total_amount_recovered: number;
  bad_retries: number;
  escalations: number;
  total_cost: number;
  net_value: number;
}

export interface BaselineComparison {
  generated_at: string;
  event_count: number;
  disclaimer: string;
  policies: PolicyResult[];
}

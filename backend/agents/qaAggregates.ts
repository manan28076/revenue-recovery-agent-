import { SafeFilter } from "./qaFilterGuard";

export interface VerifiedAggregates {
  count: number;
  amount_at_risk: number;
  confirmed_recovered: number;
  pending_predicted: number;
  by_outcome: Record<string, number>;
}
export function computeVerifiedAggregates(entries: any[]): VerifiedAggregates {
  const count = entries.length;
  const amount_at_risk = entries.reduce((s, e) => s + e.paymentEvent.amount, 0);
  const confirmed_recovered = entries
    .filter((e) => e.outcome === "recovered")
    .reduce((s, e) => s + e.amountRecovered, 0);
  const pending_predicted = entries
    .filter((e) => e.outcome === "pending")
    .reduce((s, e) => s + e.predictedRecoveryAmount, 0);

  const by_outcome: Record<string, number> = {};
  for (const e of entries) {
    by_outcome[e.outcome] = (by_outcome[e.outcome] || 0) + 1;
  }

  return { count, amount_at_risk, confirmed_recovered, pending_predicted, by_outcome };
}

export function templatedFallback(aggregates: VerifiedAggregates, filter: SafeFilter): string {
  if (aggregates.count === 0) {
    return `No transactions matched that filter (${JSON.stringify(filter)}).`;
  }
  const recoveredCount = aggregates.by_outcome["recovered"] || 0;
  const pendingCount = aggregates.by_outcome["pending"] || 0;
  return `Found ${aggregates.count} matching transaction(s). ${recoveredCount} confirmed recovered, totaling ₹${(aggregates.confirmed_recovered / 100).toLocaleString("en-IN")}. ${pendingCount} still pending confirmation (predicted ₹${(aggregates.pending_predicted / 100).toLocaleString("en-IN")}).`;
}
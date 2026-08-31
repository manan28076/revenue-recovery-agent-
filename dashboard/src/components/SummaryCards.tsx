import type { ReportData } from "../types";
import { useCountUp } from "../useCountUp";

function formatInr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function TallyCard({
  label,
  target,
  delay,
  format,
  hint,
}: {
  label: string;
  target: number;
  delay: number;
  format: (n: number) => string;
  hint?: string;
}) {
  const value = useCountUp(target, 900, delay);
  return (
    <div className="summary-card" title={hint}>
      <div className="summary-value">{format(value)}</div>
      <div className="summary-label">{label}</div>
    </div>
  );
}

export function SummaryCards({ report }: { report: ReportData }) {
  const cards = [
    {
      label: "Revenue at Risk",
      target: report.total_amount_at_risk,
      format: (n: number) => formatInr(n),
      hint: "Total value of all failed payments.",
    },
    {
      label: "Revenue Recovered",
      target: report.total_verified_revenue_recovered,
      format: (n: number) => formatInr(n),
      hint: "Real, confirmed money recovered.",
    },
    {
      label: "Recovery Rate",
      target: (report.total_verified_revenue_recovered / (report.total_amount_at_risk || 1)) * 100,
      format: (n: number) => `${n.toFixed(1)}%`,
      hint: "Percentage of at-risk revenue successfully recovered.",
    },
    {
      label: "Recovery Uplift",
      target: report.eval_metrics?.recovery_uplift_vs_baseline_percent ?? 0,
      format: (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`,
      hint: "Net uplift compared to a blind retry baseline, strictly evaluated on held-out data.",
    },
    { 
      label: "Failed Transactions", 
      target: report.total_events, 
      format: (n: number) => String(n),
      hint: "Total count of failed payment events processed."
    },
    { 
      label: "Recovered Transactions", 
      target: report.outcome_breakdown["recovered"] || 0, 
      format: (n: number) => String(n),
      hint: "Count of successfully recovered transactions."
    },
    { 
      label: "Blocked Risky Transactions", 
      target: (report.eval_metrics?.blocked_risky_fraud_actions ?? 0) || (report.action_breakdown["escalate_human"] || 0), 
      format: (n: number) => String(n),
      hint: "Number of unsafe, fraudulent, or economically unviable retries prevented."
    },
    {
      label: "Intervention Budget Used",
      target: report.intervention_budget_used || 0,
      format: (n: number) => `${formatInr(n)} / ${formatInr(report.intervention_budget_limit || 0)}`,
      hint: "Live circuit breaker for maximum daily spend on automated recovery actions.",
    },
  ];

  return (
    <div className="summary-grid">
      {cards.map((c, i) => (
        <TallyCard key={c.label} label={c.label} target={c.target} delay={i * 80} format={c.format} hint={c.hint} />
      ))}
    </div>
  );
}

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
    { label: "Total events", target: report.total_events, format: (n: number) => String(n) },
    {
      label: "Revenue at risk",
      target: report.total_amount_at_risk,
      format: (n: number) => formatInr(n),
    },
    {
      label: "Verified Revenue Recovered",
      target: report.total_verified_revenue_recovered,
      format: (n: number) => formatInr(n),
      hint: `Real, confirmed money only - webhook-verified payments or explicit merchant confirmation.`,
    },
    {
      label: "Total Recovery Potential",
      target: report.total_expected_recovery_potential,
      format: (n: number) => formatInr(n),
      hint: "Total expected net value of eligible recovery opportunities.",
    },
    {
      label: "Estimated Recovery Potential",
      target: report.total_amount_predicted_recovered,
      format: (n: number) => formatInr(n),
      hint: "Probability-weighted expected value of pending cases.",
    },
    {
      label: "Simulated Recovery",
      target: report.total_simulated_recovery,
      format: (n: number) => formatInr(n),
      hint: "Demo simulator successes. NOT verified revenue.",
    },
    {
      label: "Recovery actions initiated",
      target: report.total_amount_actions_initiated,
      format: (n: number) => formatInr(n),
      hint: "Amount actively pursued via retry, nudge, or mandate reschedule.",
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

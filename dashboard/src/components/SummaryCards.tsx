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
      label: "Recovery actions initiated",
      target: report.total_amount_actions_initiated,
      format: (n: number) => formatInr(n),
      hint: "Amount actively pursued via retry, nudge, or mandate reschedule - regardless of whether it has resolved yet.",
    },
    {
      label: "Pending confirmation",
      target: report.total_amount_pending_confirmation,
      format: (n: number) => formatInr(n),
      hint: "Awaiting a real webhook or override. Not recovered, not failed - still in flight.",
    },
    {
      label: "Confirmed recovered",
      target: report.total_amount_confirmed_recovered,
      format: (n: number) => formatInr(n),
      hint: `Real, confirmed money only - webhook-verified payments or explicit merchant confirmation. ${(report.confirmed_recovery_rate * 100).toFixed(1)}% of revenue at risk.`,
    },
    {
      label: "Predicted recovery (unconfirmed)",
      target: report.total_amount_predicted_recovered,
      format: (n: number) => formatInr(n),
      hint: "Probability-weighted expected value of pending cases - a model estimate, NOT a confirmed payment. Fire a webhook against a transaction to confirm it for real.",
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

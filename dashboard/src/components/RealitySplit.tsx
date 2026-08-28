import type { ReportData } from "../types";

function formatInr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
export function RealitySplit({ report }: { report: ReportData }) {
  return (
    <div className="reality-split">
      <div className="reality-split-header">
        <span className="reality-split-title">Live Test Data - what's real vs. synthetic</span>
      </div>
      <div className="reality-split-row">
        <div className="reality-item">
          <span className="reality-value">{report.real_object_count}</span>
          <span className="reality-key">Real Razorpay test-mode events</span>
        </div>
        <div className="reality-item">
          <span className="reality-value">{report.synthetic_event_count}</span>
          <span className="reality-key">Synthetic demo events</span>
        </div>
        <div className="reality-item">
          <span className="reality-value" style={{ color: "var(--ledger-green)" }}>
            {report.confirmed_payment_count}
          </span>
          <span className="reality-key">Confirmed payments (webhook/override)</span>
        </div>
        <div className="reality-item">
          <span className="reality-value">{(report.confirmed_recovery_rate * 100).toFixed(1)}%</span>
          <span className="reality-key" title="Confirmed recovered money divided by total revenue at risk - counts only webhook/override-confirmed amounts, never pending or predicted ones">
            Confirmed recovery rate
          </span>
        </div>
        <div className="reality-item">
          <span className="reality-value">{formatInr(report.total_expected_net_value)}</span>
          <span className="reality-key" title="Sum of the economic decision layer's own expected_net_value across every decision (amount x recovery probability - intervention cost) - directly traceable to this system's actual reasoning, not an invented constant">
            Expected net value
          </span>
        </div>
      </div>
    </div>
  );
}

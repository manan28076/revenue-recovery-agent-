import type { ReportData } from "../types";

function formatInr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function ActionBreakdown({ report }: { report: ReportData }) {
  const breakdown = report.action_recovered_breakdown || {};
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel action-breakdown">
      <h2>Revenue Recovered by Action</h2>
      <div className="action-breakdown-list" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
        {entries.length === 0 ? (
          <p className="dim">No recoveries yet.</p>
        ) : (
          entries.map(([action, amount]) => (
            <div key={action} className="action-row" style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }}>
              <span className="action-name badge">{action}</span>
              <span className="action-amount font-mono font-bold" style={{ color: "var(--success)" }}>{formatInr(amount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

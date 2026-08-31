import { useEffect, useState } from "react";
import type { AuditLogRow } from "../types";

function formatInr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function DecisionLog() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:4000/api/audit-log")
      .then((r) => r.json())
      .then((data) => {
        setLogs(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="panel">Loading decisions...</div>;

  return (
    <div className="panel decision-log" style={{ overflowX: "auto" }}>
      <h2>Per-Transaction Decision Log</h2>
      <div className="table-container" style={{ marginTop: "1rem" }}>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <th style={{ padding: "0.5rem" }}>ID</th>
              <th style={{ padding: "0.5rem" }}>Amount</th>
              <th style={{ padding: "0.5rem" }}>Failure Reason</th>
              <th style={{ padding: "0.5rem" }}>Selected Action</th>
              <th style={{ padding: "0.5rem" }}>Expected Net Recovery</th>
              <th style={{ padding: "0.5rem" }}>Outcome</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 10).map((log) => (
              <tr key={log.transactionId} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.5rem" }}>{log.transactionId}</td>
                <td style={{ padding: "0.5rem" }}>{formatInr(log.paymentEvent.amount)}</td>
                <td style={{ padding: "0.5rem" }}>{log.rootCause}</td>
                <td style={{ padding: "0.5rem" }}><span className="badge">{log.actionTaken}</span></td>
                <td style={{ padding: "0.5rem" }}>{log.expectedNetValue != null ? formatInr(log.expectedNetValue) : "-"}</td>
                <td style={{ padding: "0.5rem", color: "var(--success)" }}>{log.amountRecovered > 0 ? formatInr(log.amountRecovered) : "-"}</td>
                <td style={{ padding: "0.5rem" }}><span className={`badge ${log.outcome}`}>{log.outcome}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length > 10 && <p className="dim" style={{marginTop: "1rem"}}>Showing latest 10 transactions.</p>}
      </div>
    </div>
  );
}

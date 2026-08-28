import { useEffect, useState } from "react";
import type { AuditLogRow } from "../types";
import { humanizeRootCause, humanizeAction, humanizeOutcome, humanizeRecoverySource } from "../labels";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

const outcomeColor: Record<string, string> = {
  recovered: "#2f8f5b",
  pending: "#c68a35",
  escalated: "#a3762b",
  failed: "#b3492a",
  skipped: "#a89a83",
};

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

interface OverrideAuditEntry {
  id: string;
  overrideAction: string;
  reason: string;
  previousOutcome: string;
  newOutcome: string;
  createdAt: string;
}

function DetailRow({ row, onRefresh }: { row: AuditLogRow; onRefresh?: () => void }) {
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [history, setHistory] = useState<OverrideAuditEntry[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/override-history/${row.transactionId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [row.transactionId, actionStatus]);

  async function handleWebhookSimulate(eventType: string, label: string) {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulate-webhook-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: row.transactionId, eventType }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      setActionStatus(label);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Webhook simulation failed:", err);
      setActionStatus((err as Error).message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOverride(overrideAction: string, label: string) {
    if (loading) return;
    if (overrideReason.trim().length < 5) {
      setActionStatus("Enter a reason (at least 5 characters) before taking an override action");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: row.transactionId, overrideAction, reason: overrideReason.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(res.status === 404 ? "Backend API not running on :4000" : `HTTP ${res.status}: ${text}`);
      }
      setActionStatus(label);
      setOverrideReason("");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Override failed:", err);
      setActionStatus((err as Error).message || "Action failed");
    } finally {
      setLoading(false);
    }
  }

  const reasonTooShort = overrideReason.trim().length < 5;

  return (
    <tr className="detail-row">
      <td colSpan={11}>
        <div className="detail-content">
          <div className="detail-block">
            <span className="detail-label">Why this diagnosis</span>
            <p>{row.classifierReasoning}</p>
            <p style={{ fontSize: "0.78rem", color: "var(--paper-muted)" }}>
              Diagnosis confidence: {(row.diagnosisConfidence * 100).toFixed(0)}% · Recovery probability: {(row.recoveryProbability * 100).toFixed(0)}%
            </p>
          </div>
          <div className="detail-block">
            <span className="detail-label">Why this action</span>
            <p>{row.strategyReasoning}</p>
            {row.expectedRecoveryValue != null && row.interventionCost != null && row.expectedNetValue != null && (
              <p style={{ fontSize: "0.78rem", color: "var(--paper-muted)" }}>
                Expected recovery value: {formatInr(row.expectedRecoveryValue)} · Intervention cost: {formatInr(row.interventionCost)} · Expected net value: {formatInr(row.expectedNetValue)}
              </p>
            )}
          </div>
          <div className="detail-block">
            <span className="detail-label">Original amount</span>
            <p>{formatInr(row.paymentEvent.amount)}</p>
          </div>
          {row.outcome === "pending" && (
            <div className="detail-block">
              <span className="detail-label">Predicted recovery (unconfirmed)</span>
              <p>{formatInr(row.predictedRecoveryAmount)} - not real money until a webhook confirms it</p>
            </div>
          )}
          <div className="detail-block">
            <span className="detail-label">Recovery source</span>
            <p>{humanizeRecoverySource(row.recoverySource)}</p>
          </div>

          <div className="detail-block" style={{ width: "100%", marginTop: "12px", borderTop: "1px dashed var(--ink-border)", paddingTop: "12px" }}>
            <span className="detail-label" style={{ color: "var(--ledger-amber)" }}>Interactive Webhook & Override Controls</span>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                style={{ ...btnStyle, background: "rgba(47, 143, 91, 0.2)", borderColor: "var(--ledger-green)" }}
                disabled={loading}
                onClick={() => handleWebhookSimulate("payment_link.paid", "Fired payment_link.paid webhook")}
              >
                ⚡ Fire Paid Webhook
              </button>
              <button
                style={{ ...btnStyle, background: "rgba(179, 73, 42, 0.2)", borderColor: "var(--ledger-red)" }}
                disabled={loading}
                onClick={() => handleWebhookSimulate("payment_link.expired", "Fired payment_link.expired webhook")}
              >
                ⚡ Fire Expired Webhook
              </button>
              <button
                style={{ ...btnStyle, background: "rgba(179, 73, 42, 0.2)", borderColor: "var(--ledger-red)" }}
                disabled={loading}
                onClick={() => handleWebhookSimulate("payment.failed", "Fired payment.failed webhook")}
              >
                ⚡ Fire Payment Failed Webhook
              </button>
            </div>

            <div style={{ marginTop: "12px" }}>
              <span className="detail-label">
                Override reason <span style={{ color: "var(--ledger-red)" }}>(required before any override action below)</span>
              </span>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. customer paid via bank transfer, confirmed by phone"
                style={{
                  width: "100%",
                  maxWidth: "480px",
                  marginTop: "4px",
                  background: "var(--ink-bg)",
                  border: `1px solid ${reasonTooShort ? "var(--ledger-red)" : "var(--ink-border)"}`,
                  borderRadius: "4px",
                  padding: "6px 10px",
                  color: "var(--paper)",
                  fontSize: "0.82rem",
                  fontFamily: "var(--font-body)",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                style={btnStyle}
                disabled={loading || reasonTooShort}
                onClick={() => handleOverride("manual_reminder", "Logged manual reminder")}
              >
                📨 Log Reminder
              </button>
              <button
                style={btnStyle}
                disabled={loading || reasonTooShort}
                onClick={() => handleOverride("mark_uncollectible", "Marked uncollectible (skipped)")}
              >
                🚫 Mark Uncollectible
              </button>
              <button
                style={btnStyle}
                disabled={loading || reasonTooShort}
                onClick={() => handleOverride("mark_still_failed", "Marked as failed")}
              >
                ✖ Mark Failed
              </button>
              <button
                style={{ ...btnStyle, background: reasonTooShort ? "var(--ink-surface-raised)" : "var(--ledger-green)" }}
                disabled={loading || reasonTooShort}
                onClick={() => handleOverride("discount_link", "Issued 10% discount recovery link")}
              >
                🏷️ Issue Discount Link
              </button>

              {actionStatus && (
                <span style={{ fontSize: "0.8rem", color: "var(--ledger-amber)", fontFamily: "var(--font-mono)", marginLeft: "8px" }}>
                  {actionStatus}
                </span>
              )}
            </div>
          </div>

          {history.length > 0 && (
            <div className="detail-block" style={{ width: "100%", marginTop: "12px", borderTop: "1px dashed var(--ink-border)", paddingTop: "12px" }}>
              <span className="detail-label" style={{ color: "var(--ledger-amber)" }}>
                Override audit trail ({history.length})
              </span>
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {history.map((h) => (
                  <div key={h.id} style={{ fontSize: "0.78rem", color: "var(--paper-muted)", fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--paper)" }}>{h.overrideAction}</span>
                    {" - "}"{h.reason}"{" "}
                    <span>({h.previousOutcome} → {h.newOutcome}, {new Date(h.createdAt).toLocaleString("en-IN")})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

const btnStyle: React.CSSProperties = {
  background: "var(--ink-surface-raised)",
  border: "1px solid var(--ink-border)",
  color: "var(--paper)",
  padding: "6px 12px",
  fontSize: "0.78rem",
  fontFamily: "var(--font-body)",
  cursor: "pointer",
};

export function AuditLogTable({ rows, onRefresh }: { rows: AuditLogRow[]; onRefresh?: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="audit-table-wrap">
      <p className="table-legend">
        Click any row to inspect decision reasoning. <strong>Diagnosis Confidence</strong> measures AI certainty in the failure root cause. <strong>Recovery Probability</strong> is a separate estimate of how likely the chosen action is to actually get the money back. A transaction only becomes <strong>Recovered</strong> once a real webhook or merchant override confirms it - it can never resolve to "Recovered" on its own.
      </p>
      <table className="audit-table">
        <thead>
          <tr>
            <th></th>
            <th title="A unique ID for this failed or overdue payment">Transaction</th>
            <th title="Whether this created a genuine object on Razorpay's real test-mode servers, or is placeholder test data">Real?</th>
            <th title="What the AI diagnosed as the reason this payment failed">Root cause</th>
            <th title="AI certainty in the failure diagnosis - not a recovery-odds figure" className="num-cell">Diagnosis Confidence</th>
            <th title="Estimated likelihood the chosen action recovers the money" className="num-cell">Recovery Probability</th>
            <th title="What the agent decided to do about it">Action</th>
            <th title="What actually happened as a result">Outcome</th>
            <th title="Confirmed recovered money, or the predicted value of a still-pending case" className="num-cell">Recovered / Predicted</th>
            <th title="Whether a recovered amount is a real, verified confirmation or a local demo trigger">Source</th>
            <th title="Opens the real Razorpay payment page, if one was created">Link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = expanded === r.transactionId;
            return (
              <>
                <tr
                  key={r.transactionId}
                  className="audit-row"
                  onClick={() => setExpanded(isOpen ? null : r.transactionId)}
                >
                  <td className="expand-arrow">{isOpen ? "▾" : "▸"}</td>
                  <td className="mono">{r.transactionId}</td>
                  <td>
                    {r.paymentEvent.isRealRazorpayObject ? (
                      <span className="stamp">Real</span>
                    ) : (
                      <span className="stamp stamp-muted">Test</span>
                    )}
                  </td>
                  <td>{humanizeRootCause(r.rootCause)}</td>
                  <td className="num-cell mono">{(r.diagnosisConfidence * 100).toFixed(0)}%</td>
                  <td className="num-cell mono">{(r.recoveryProbability * 100).toFixed(0)}%</td>
                  <td>{humanizeAction(r.actionTaken)}</td>
                  <td>
                    <span className="outcome-pill" style={{ color: outcomeColor[r.outcome] ?? "inherit" }}>
                      <span
                        className="outcome-dot"
                        style={{ background: outcomeColor[r.outcome] ?? "inherit" }}
                      />
                      {humanizeOutcome(r.outcome)}
                    </span>
                  </td>
                  <td className="num-cell mono">
                    {r.outcome === "recovered"
                      ? formatInr(r.amountRecovered)
                      : r.outcome === "pending"
                      ? `~${formatInr(r.predictedRecoveryAmount)}`
                      : "-"}
                  </td>
                  <td>
                    {r.outcome === "recovered" ? (
                      <span
                        className={r.recoverySource === "demo_confirmed" ? "stamp stamp-muted" : "stamp"}
                        title={
                          r.recoverySource === "demo_confirmed"
                            ? "Confirmed via the dashboard's demo webhook button - not a cryptographically verified Razorpay webhook"
                            : r.recoverySource === "webhook_confirmed"
                            ? "Confirmed by a real, signature-verified Razorpay webhook"
                            : "Confirmed by explicit merchant override"
                        }
                      >
                        {humanizeRecoverySource(r.recoverySource)}
                      </span>
                    ) : r.outcome === "pending" ? (
                      <span className="stamp stamp-muted" title="Not confirmed yet - awaiting a webhook or override">Unconfirmed</span>
                    ) : (
                      <span className="cell-dash">-</span>
                    )}
                  </td>
                  <td>
                    {r.recoveryLinkUrl ? (
                      <a
                        href={r.recoveryLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="link-pill"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View →
                      </a>
                    ) : (
                      <span className="cell-dash">-</span>
                    )}
                  </td>
                </tr>
                {isOpen && <DetailRow key={`${r.transactionId}-detail`} row={r} onRefresh={onRefresh} />}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
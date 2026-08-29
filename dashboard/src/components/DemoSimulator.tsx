import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

interface DemoSimulatorProps {
  onRefresh: () => void;
  onComplete?: () => void;
}

export function DemoSimulator({ onRefresh, onComplete }: DemoSimulatorProps) {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [activeTxn, setActiveTxn] = useState<string | null>(null);
  const [failureType, setFailureType] = useState("checkout_abandoned");

  async function handleSimulateFlow() {
    if (running) return;
    setRunning(true);
    setErrorDetails(null);
    setStep("1/3: Ingesting payment failure event...");

    try {
      const res = await fetch(`${API_BASE}/api/simulate-failure`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_ADMIN_API_SECRET}`
        },
        body: JSON.stringify({ failureCode: failureType }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(res.status === 404 ? "Backend API not found on :4000" : `API error ${res.status}: ${text}`);
      }
      const data = await res.json();
      const txnId = data.transactionId;
      const rootCause: string = data.auditEntry?.root_cause;
      const actionTaken: string = data.auditEntry?.action_taken;
      const outcome: string = data.auditEntry?.outcome;
      const diagnosisConfidence: number = data.auditEntry?.diagnosis_confidence ?? 0;
      const predictedRecoveryAmount: number = data.auditEntry?.predicted_recovery_amount ?? 0;

      setActiveTxn(txnId);
      setStep(`2/3: AI Diagnosed: ${rootCause} (Diagnosis confidence: ${(diagnosisConfidence * 100).toFixed(0)}%) → Strategy: ${actionTaken}`);

      await new Promise((r) => setTimeout(r, 1200));
      onRefresh();

      await new Promise((r) => setTimeout(r, 800));
      if (outcome === "pending") {
        setStep(`3/3 Complete: ${txnId} - recovery link sent, awaiting payment. Predicted value: ₹${(predictedRecoveryAmount / 100).toLocaleString("en-IN")} (UNCONFIRMED - open this row and fire a webhook to confirm it for real)`);
      } else if (outcome === "escalated") {
        setStep(`3/3 Complete: ${txnId} escalated to human follow-up (Risk/Safety threshold applied)`);
      } else if (outcome === "skipped") {
        setStep(`3/3 Complete: ${txnId} - no action taken (Outcome: skipped)`);
      } else {
        setStep(`3/3 Complete: ${txnId} processed → Outcome: ${outcome}`);
      }
      onRefresh();
      if (onComplete) onComplete();
    } catch (err) {
      console.error(err);
      const errMsg = (err as Error).message || "Unknown error";
      setErrorDetails(errMsg);
      setStep("Simulation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.badge}>Live Interactive Demo</span>
        <h3 style={styles.title}>Autonomous AI Recovery Pipeline</h3>
      </div>
      <p style={styles.desc}>
        Simulate a payment failure and trace how the AI agent autonomously classifies root causes, enforces stopping rules, and executes recovery.
      </p>

      <div style={styles.controls}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "0.75rem", color: "var(--paper-muted)" }}>Payment Failure Scenario</label>
          <select
            value={failureType}
            onChange={(e) => setFailureType(e.target.value)}
            disabled={running}
            style={styles.select}
          >
            <option value="checkout_abandoned">Checkout Abandoned (UPI)</option>
            <option value="insufficient_funds">Insufficient Funds (Card)</option>
            <option value="card_declined">Card Declined (Issuer)</option>
            <option value="invoice_overdue">Invoice Overdue (B2B)</option>
            <option value="fraud_suspected">Fraud Suspected (High Risk)</option>
          </select>
        </div>

        <button onClick={handleSimulateFlow} disabled={running} style={{ ...styles.button, marginTop: "16px" }}>
          {running ? "Running AI Pipeline..." : "⚡ Run Live Recovery Simulation"}
        </button>
      </div>

      {step && (
        <div style={{ ...styles.statusBox, borderLeftColor: errorDetails ? "var(--ledger-red)" : "var(--ledger-green)" }}>
          <span style={{ ...styles.statusText, color: errorDetails ? "var(--ledger-red)" : "var(--paper)" }}>
            {step} {errorDetails ? `(${errorDetails})` : ""}
          </span>
          {activeTxn && !errorDetails && <span style={styles.txnTag}>Txn ID: {activeTxn}</span>}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--ink-surface)",
    border: "1px solid var(--ink-border)",
    padding: "20px 22px",
    marginTop: "24px",
    marginBottom: "12px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "6px",
  },
  badge: {
    background: "rgba(198, 138, 53, 0.15)",
    color: "var(--ledger-amber)",
    border: "1px solid var(--ledger-amber)",
    fontSize: "0.7rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    padding: "2px 8px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "1.1rem",
    fontFamily: "var(--font-display)",
    color: "var(--paper)",
    fontWeight: 500,
  },
  desc: {
    margin: "0 0 16px 0",
    fontSize: "0.88rem",
    color: "var(--paper-muted)",
  },
  controls: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  select: {
    background: "var(--ink-bg)",
    color: "var(--paper)",
    border: "1px solid var(--ink-border)",
    padding: "8px 12px",
    fontSize: "0.85rem",
    fontFamily: "var(--font-body)",
    outline: "none",
  },
  button: {
    background: "var(--ledger-green)",
    color: "var(--paper)",
    border: "none",
    padding: "9px 18px",
    fontSize: "0.85rem",
    fontFamily: "var(--font-body)",
    fontWeight: 500,
    cursor: "pointer",
  },
  statusBox: {
    marginTop: "14px",
    padding: "10px 14px",
    background: "var(--ink-bg)",
    borderLeft: "3px solid var(--ledger-green)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusText: {
    fontSize: "0.82rem",
    fontFamily: "var(--font-mono)",
  },
  txnTag: {
    fontSize: "0.78rem",
    color: "var(--paper-muted)",
    fontFamily: "var(--font-mono)",
  },
};
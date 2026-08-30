import { useEffect, useState } from "react";
import { SummaryCards } from "./components/SummaryCards";
import { RealitySplit } from "./components/RealitySplit";
import { BaselineEval } from "./components/BaselineEval";
import { MonteCarloResults } from "./components/MonteCarloResults";
import { OutcomeChart, RootCauseChart, ActionChart } from "./components/Charts";
import { AuditLogTable } from "./components/AuditLogTable";
import { AskPanel } from "./components/AskPanel";
import { Tabs } from "./components/Tabs";
import { DemoSimulator } from "./components/DemoSimulator";
import type { ReportData, AuditLogRow } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "audit", label: "Audit trail" },
  { id: "human_review", label: "Human Review" },
  { id: "ask", label: "Ask" },
];

export default function App() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    try {
      const [reportRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/api/report`),
        fetch(`${API_BASE}/api/audit-log`),
      ]);
      if (!reportRes.ok || !logsRes.ok) throw new Error("API request failed");
      setReport(await reportRes.json());
      setLogs(await logsRes.json());
    } catch (err) {
      setError(
        `Couldn't reach the API at ${API_BASE}. Make sure the backend is running (npm run api) and the DB is loaded (npm run db:load).`
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <header>
        <p className="eyebrow">Statement of Recovery Activity</p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <h1 style={{ margin: 0 }}>Revenue Recovery Agent</h1>
          <span style={{ 
            background: "rgba(230, 162, 60, 0.2)", 
            color: "#e6a23c", 
            padding: "4px 8px", 
            borderRadius: "4px", 
            fontSize: "0.8rem", 
            fontFamily: "var(--font-mono)", 
            border: "1px solid rgba(230, 162, 60, 0.4)" 
          }}>
            ⚡ RAZORPAY TEST MODE
          </span>
        </div>
        <p className="subtitle">Razorpay Buildathon — Track 3: AI Revenue Recovery</p>
        <p className="explainer">
          Autonomous recovery pipeline for payment failures, checkout abandonments, and overdue receivables with real-time audit tracking.
        </p>
      </header>

      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}

      {report && (
        <>
          <RealitySplit report={report} />
          <DemoSimulator onRefresh={fetchData} onComplete={() => setActiveTab("audit")} />
          <SummaryCards report={report} />
          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

          {activeTab === "overview" && (
            <>
              <div className="chart-grid">
                <OutcomeChart data={report.outcome_breakdown} />
                <RootCauseChart data={report.root_cause_breakdown} />
                <ActionChart data={report.action_breakdown} />
              </div>
              <BaselineEval />
              <MonteCarloResults />
            </>
          )}

          {activeTab === "audit" && logs.length > 0 && (
            <AuditLogTable rows={logs} onRefresh={fetchData} />
          )}

          {activeTab === "human_review" && (
            <div style={{ marginTop: "20px" }}>
              <h2 style={{ fontSize: "1.2rem", color: "var(--paper)", marginBottom: "8px" }}>Requires Human Review</h2>
              <p style={{ color: "var(--paper-muted)", fontSize: "0.9rem", marginBottom: "16px" }}>
                These transactions were either explicitly escalated by the AI, or have failed multiple recovery attempts.
              </p>
              <AuditLogTable rows={logs.filter(l => l.outcome === "escalated" || l.outcome === "failed")} onRefresh={fetchData} />
            </div>
          )}

          {activeTab === "ask" && <AskPanel />}
        </>
      )}
    </div>
  );
}
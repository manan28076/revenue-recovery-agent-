import { useEffect, useState } from "react";
import { SummaryCards } from "./components/SummaryCards";
import { RealitySplit } from "./components/RealitySplit";
import { BaselineEval } from "./components/BaselineEval";
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
  }, []);

  return (
    <div className="app">
      <header>
        <p className="eyebrow">Statement of Recovery Activity</p>
        <h1>Revenue Recovery Agent</h1>
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
            </>
          )}

          {activeTab === "audit" && logs.length > 0 && (
            <AuditLogTable rows={logs} onRefresh={fetchData} />
          )}

          {activeTab === "ask" && <AskPanel />}
        </>
      )}
    </div>
  );
}
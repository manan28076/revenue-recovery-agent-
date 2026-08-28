import { useEffect, useState } from "react";
import type { BaselineComparison } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function formatInr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
export function BaselineEval() {
  const [data, setData] = useState<BaselineComparison | null>(null);
  const [notReady, setNotReady] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/baseline-report`)
      .then((res) => {
        if (!res.ok) throw new Error("not ready");
        return res.json();
      })
      .then(setData)
      .catch(() => setNotReady(true));
  }, []);

  if (notReady) {
    return (
      <div className="baseline-eval">
        <h3>Offline Counterfactual Evaluation</h3>
        <p className="baseline-eval-note">
          Not generated yet. Run <code>npm run eval:baseline</code> to compare "do nothing" vs "blind retry" vs this agent
          on the same dataset.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const agent = data.policies.find((p) => p.policy === "agent");
  const blindRetry = data.policies.find((p) => p.policy === "blind_retry");
  const netUplift =
    agent && blindRetry && blindRetry.net_value !== 0
      ? ((agent.net_value - blindRetry.net_value) / Math.abs(blindRetry.net_value)) * 100
      : null;

  return (
    <div className="baseline-eval">
      <h3>Offline Counterfactual Evaluation</h3>
      <div className="baseline-eval-disclaimer">⚠️ {data.disclaimer}</div>
      <p className="baseline-eval-note">
        Same {data.event_count}-event dataset, three policies, run head to head.
        {netUplift !== null && agent && blindRetry && (
          <>
            {" "}
            Agent net value is <strong>{netUplift >= 0 ? "+" : ""}{netUplift.toFixed(1)}%</strong> vs blind retry, with{" "}
            <strong>{Math.max(0, blindRetry.bad_retries - agent.bad_retries)} fewer unsafe retries</strong>.
          </>
        )}
      </p>
      <table className="baseline-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th className="num-cell">Recovered (simulated)</th>
            <th className="num-cell">Bad retries</th>
            <th className="num-cell">Escalations</th>
            <th className="num-cell">Cost</th>
            <th className="num-cell">Net value</th>
          </tr>
        </thead>
        <tbody>
          {data.policies.map((p) => (
            <tr key={p.policy} className={p.policy === "agent" ? "agent-row" : ""}>
              <td>{p.label}</td>
              <td className="num-cell">{formatInr(p.total_amount_recovered)}</td>
              <td className="num-cell">{p.bad_retries}</td>
              <td className="num-cell">{p.escalations}</td>
              <td className="num-cell">{formatInr(p.total_cost)}</td>
              <td className="num-cell">{formatInr(p.net_value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

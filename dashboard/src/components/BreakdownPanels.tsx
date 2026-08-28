import { humanizeOutcome, humanizeRootCause, humanizeAction, humanizeBreakdown } from "../labels";

function BreakdownBlock({ title, data }: { title: string; data: Record<string, number> }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div className="breakdown-block">
      <h3>{title}</h3>
      {Object.entries(data).map(([key, count]) => (
        <div className="breakdown-row" key={key}>
          <span className="breakdown-key">{key}</span>
          <div className="breakdown-bar-track">
            <div className="breakdown-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="breakdown-count">{count}</span>
        </div>
      ))}
    </div>
  );
}

export function BreakdownPanels({
  outcomes,
  rootCauses,
  actions,
}: {
  outcomes: Record<string, number>;
  rootCauses: Record<string, number>;
  actions: Record<string, number>;
}) {
  return (
    <div className="breakdown-grid">
      <BreakdownBlock title="Outcomes" data={humanizeBreakdown(outcomes, humanizeOutcome)} />
      <BreakdownBlock title="Root causes" data={humanizeBreakdown(rootCauses, humanizeRootCause)} />
      <BreakdownBlock title="Actions taken" data={humanizeBreakdown(actions, humanizeAction)} />
    </div>
  );
}
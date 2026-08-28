import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { humanizeOutcome, humanizeRootCause, humanizeAction } from "../labels";

const OUTCOME_COLORS: Record<string, string> = {
  recovered: "#2f8f5b",
  pending: "#c68a35",
  escalated: "#a3762b",
  failed: "#b3492a",
  skipped: "#a89a83",
};

function toChartData(data: Record<string, number>, humanize: (v: string) => string) {
  return Object.entries(data).map(([key, count]) => ({ key, name: humanize(key), count }));
}

const tooltipStyle = {
  background: "#201b16",
  border: "1px solid #3a2f24",
  borderRadius: 4,
  color: "#efe8da",
  fontSize: 13,
  fontFamily: "IBM Plex Mono, ui-monospace, monospace",
};

export function OutcomeChart({ data }: { data: Record<string, number> }) {
  const chartData = toChartData(data, humanizeOutcome);
  return (
    <div className="chart-block">
      <h3>Outcomes</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={chartData} dataKey="count" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {chartData.map((entry) => (
              <Cell key={entry.key} fill={OUTCOME_COLORS[entry.key] ?? "#5b7fa6"} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {chartData.map((entry) => (
          <span key={entry.key} className="legend-item">
            <span className="legend-swatch" style={{ background: OUTCOME_COLORS[entry.key] ?? "#5b7fa6" }} />
            {entry.name} ({entry.count})
          </span>
        ))}
      </div>
    </div>
  );
}

export function RootCauseChart({ data }: { data: Record<string, number> }) {
  const chartData = toChartData(data, humanizeRootCause).sort((a, b) => b.count - a.count);
  return (
    <div className="chart-block">
      <h3>Root causes</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" tick={{ fill: "#a89a83", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fill: "#efe8da", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#262019" }} />
          <Bar dataKey="count" fill="#5b7fa6" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActionChart({ data }: { data: Record<string, number> }) {
  const chartData = toChartData(data, humanizeAction).sort((a, b) => b.count - a.count);
  return (
    <div className="chart-block">
      <h3>Actions taken</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" tick={{ fill: "#a89a83", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fill: "#efe8da", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#262019" }} />
          <Bar dataKey="count" fill="#c68a35" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
import React from "react";

export function MonteCarloResults() {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.badge}>DATA SCIENCE / SIMULATION</span>
        <h3 style={styles.title}>Mathematical Proof of Value (Monte Carlo Simulation)</h3>
      </div>
      <p style={styles.desc}>
        Offline dynamic simulation of 10,000 randomized transactions to mathematically prove the Expected Net Value (ENV) strategy vs Baseline Rule-Based Retries.
      </p>
      
      <div style={styles.terminal}>
        <div style={styles.terminalHeader}>
          <div style={styles.dotGroup}>
            <div style={{...styles.dot, backgroundColor: '#ff5f56'}}></div>
            <div style={{...styles.dot, backgroundColor: '#ffbd2e'}}></div>
            <div style={{...styles.dot, backgroundColor: '#27c93f'}}></div>
          </div>
          <span style={styles.terminalTitle}>bash - simulate_monte_carlo.ts</span>
        </div>
        <div style={styles.terminalBody}>
          <div style={{ color: '#38bdf8', marginBottom: '12px' }}>Running Monte Carlo Simulation on 10,000 dynamic events...</div>
          <div style={{ color: '#94a3b8' }}>=======================================================</div>
          <div style={{ color: '#cbd5e1', fontWeight: 600 }}>           MONTE CARLO SIMULATION RESULTS             </div>
          <div style={{ color: '#94a3b8', marginBottom: '12px' }}>=======================================================</div>
          
          <div style={{ color: '#94a3b8', marginBottom: '4px' }}>--- BASELINE (Rule-Based Retries) ---</div>
          <div>Total Revenue Recovered: <span style={{ color: '#f8fafc', fontWeight: 500 }}>₹1,25,94,051</span></div>
          <div style={{ marginBottom: '16px' }}>Successful Recoveries: 2,541</div>
          
          <div style={{ color: '#10b981', marginBottom: '4px' }}>--- MULTI-AGENT ARCHITECTURE ---</div>
          <div>Total Revenue Recovered: <span style={{ color: '#fef3c7', fontWeight: 500 }}>₹1,46,28,930</span></div>
          <div>Successful Recoveries: 3,230</div>
          <div style={{ marginBottom: '16px' }}>Discounts Dynamically Issued: 4,232</div>
          
          <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px' }}>{">>> NET REVENUE LIFT: +16.16% <<<"}</div>
          <div style={{ color: '#94a3b8' }}>=======================================================</div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--ink-surface)",
    border: "1px solid var(--ink-border)",
    padding: "20px 22px",
    marginTop: "24px",
    marginBottom: "24px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "6px",
  },
  badge: {
    background: "rgba(139, 92, 246, 0.15)",
    color: "#a78bfa",
    border: "1px solid rgba(139, 92, 246, 0.3)",
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
    lineHeight: "1.4",
  },
  terminal: {
    background: "#0f172a",
    borderRadius: "6px",
    border: "1px solid #1e293b",
    overflow: "hidden",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    lineHeight: "1.5",
  },
  terminalHeader: {
    background: "#1e293b",
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderBottom: "1px solid #334155",
  },
  dotGroup: {
    display: "flex",
    gap: "6px",
  },
  dot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
  },
  terminalTitle: {
    color: "#94a3b8",
    fontSize: "0.75rem",
    letterSpacing: "0.02em",
  },
  terminalBody: {
    padding: "16px 20px",
    color: "#cbd5e1",
  }
};

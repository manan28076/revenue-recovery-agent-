export function FlowIndicator() {
  return (
    <div className="panel flow-indicator">
      <div className="flow-steps" style={{ 
        display: "flex", 
        flexWrap: "wrap", 
        alignItems: "center", 
        justifyContent: "center", 
        gap: "0.5rem", 
        fontFamily: "var(--font-mono)", 
        fontSize: "0.75rem",
        padding: "1rem",
        background: "rgba(0,0,0,0.2)",
        borderRadius: "8px"
      }}>
        <div className="step badge" style={{ background: "rgba(255, 60, 60, 0.2)", color: "#ff8080" }}>FAILED PAYMENT</div>
        <div className="arrow dim">→</div>
        <div className="step badge" style={{ background: "rgba(100, 100, 255, 0.2)", color: "#a0a0ff" }}>DIAGNOSIS</div>
        <div className="arrow dim">→</div>
        <div className="step badge" style={{ background: "rgba(100, 255, 100, 0.2)", color: "#80ff80" }}>ENV CALCULATION</div>
        <div className="arrow dim">→</div>
        <div className="step badge" style={{ background: "rgba(255, 200, 50, 0.2)", color: "#ffd060" }}>SAFETY CHECK</div>
        <div className="arrow dim">→</div>
        <div className="step badge" style={{ background: "rgba(100, 255, 255, 0.2)", color: "#80ffff" }}>ACTION</div>
        <div className="arrow dim">→</div>
        <div className="step badge" style={{ background: "rgba(200, 100, 255, 0.2)", color: "#d080ff" }}>WEBHOOK</div>
        <div className="arrow dim">→</div>
        <div className="step badge" style={{ background: "var(--success-bg)", color: "var(--success)" }}>REVENUE RECOVERED</div>
      </div>
    </div>
  );
}

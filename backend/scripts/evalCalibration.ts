import { readFileSync } from "fs";
import { join } from "path";
import { AuditLogEntry } from "../types";

function runCalibration() {
  const dataDir = join(__dirname, "..", "..", "data");
  let auditLog: AuditLogEntry[] = [];
  try {
    auditLog = JSON.parse(readFileSync(join(dataDir, "audit_log.json"), "utf-8"));
  } catch (err) {
    console.error("Could not read audit_log.json. Please run `npm run demo:pipeline` first.");
    process.exit(1);
  }

  let highConfidenceTotal = 0;
  let highConfidenceSuccess = 0;
  
  let midConfidenceTotal = 0;
  let midConfidenceSuccess = 0;
  
  let lowConfidenceTotal = 0;
  let lowConfidenceSuccess = 0;

  for (const entry of auditLog) {
    const isSuccess = entry.outcome === "recovered" || (entry.root_cause === "unrecoverable_fraud" && entry.outcome === "escalated");
    
    if (entry.diagnosis_confidence >= 0.8) {
      highConfidenceTotal++;
      if (isSuccess) highConfidenceSuccess++;
    } else if (entry.diagnosis_confidence >= 0.5) {
      midConfidenceTotal++;
      if (isSuccess) midConfidenceSuccess++;
    } else {
      lowConfidenceTotal++;
      if (isSuccess) lowConfidenceSuccess++;
    }
  }

  console.log("=== Confidence Calibration Report ===");
  console.log("This measures whether the AI's self-reported confidence correlates with positive outcomes (successful recovery or correctly escalating fraud).");
  console.log("");
  
  const highPct = highConfidenceTotal > 0 ? (highConfidenceSuccess / highConfidenceTotal * 100).toFixed(1) : "0.0";
  console.log(`> 80% Confidence: ${highPct}% success rate (${highConfidenceSuccess}/${highConfidenceTotal})`);
  
  const midPct = midConfidenceTotal > 0 ? (midConfidenceSuccess / midConfidenceTotal * 100).toFixed(1) : "0.0";
  console.log(`50-80% Confidence: ${midPct}% success rate (${midConfidenceSuccess}/${midConfidenceTotal})`);
  
  const lowPct = lowConfidenceTotal > 0 ? (lowConfidenceSuccess / lowConfidenceTotal * 100).toFixed(1) : "0.0";
  console.log(`< 50% Confidence: ${lowPct}% success rate (${lowConfidenceSuccess}/${lowConfidenceTotal})`);
  console.log("=====================================");
}

runCalibration();

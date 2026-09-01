import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PaymentEvent, ClassificationResult } from "../types";
import { runBaselineComparison } from "../evaluation/baselineEval";
async function main() {
  const dataDir = join(__dirname, "..", "..", "data");
  const events: PaymentEvent[] = JSON.parse(readFileSync(join(dataDir, "payment_events.json"), "utf-8"));
  const classifications: ClassificationResult[] = JSON.parse(
    readFileSync(join(dataDir, "classifications.json"), "utf-8")
  );

  // Deterministic 70/30 split for evaluation
  // 70% Calibration, 30% Held-out Evaluation
  const evalEvents = events.filter((e, i) => i % 10 < 3);
  const evalClassifications = classifications.filter((c) =>
    evalEvents.some((e) => e.transaction_id === c.transaction_id)
  );

  const comparison = await runBaselineComparison(evalEvents, evalClassifications);

  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, "baseline_report.json");
  writeFileSync(outPath, JSON.stringify(comparison, null, 2));

  console.log(`\n=== Baseline Evaluation (${comparison.event_count} events) ===`);
  console.log(`⚠️  ${comparison.disclaimer}\n`);
  console.table(
    comparison.policies.map((p) => ({
      Strategy: p.label,
      "Gross recovered (₹)": (p.total_amount_recovered / 100).toLocaleString("en-IN"),
      "Intervention cost (₹)": (p.total_cost / 100).toLocaleString("en-IN"),
      "Net value (₹)": (p.net_value / 100).toLocaleString("en-IN"),
      "Actions taken": p.actions_taken,
      "Escalations": p.escalations,
      "Unnecessary interventions": p.bad_retries,
    }))
  );

  const agent = comparison.policies.find((p) => p.policy === "agent")!;
  const blindRetry = comparison.policies.find((p) => p.policy === "blind_retry")!;
  if (blindRetry.net_value !== 0) {
    const netUplift = ((agent.net_value - blindRetry.net_value) / Math.abs(blindRetry.net_value)) * 100;
    console.log(
      `\nAgent net value is ${netUplift >= 0 ? "+" : ""}${netUplift.toFixed(1)}% vs blind retry, ` +
      `with ${blindRetry.bad_retries - agent.bad_retries} fewer unsafe retries.`
    );
  }

  console.log(`\nSaved -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
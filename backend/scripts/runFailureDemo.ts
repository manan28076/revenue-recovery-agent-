import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { PaymentEvent } from "../types";
import { classifyBatch } from "../agents/classifierAgent";
async function main() {
  const dataPath = join(__dirname, "..", "..", "data", "payment_events.json");
  let events: PaymentEvent[];
  try {
    events = JSON.parse(readFileSync(dataPath, "utf-8"));
  } catch {
    console.error("No data/payment_events.json found. Run `npm run generate-data` or `npm run seed-real-data` first.");
    process.exit(1);
  }

  const sample = events.slice(0, 10);

  console.log("=".repeat(60));
  console.log("STEP 1: Classifying 10 events normally (Gemini live)");
  console.log("=".repeat(60));
  delete process.env.DEMO_FORCE_FAILURE;
  const normalResults = await classifyBatch(sample);
  const normalHeuristicCount = normalResults.filter((r) =>
    r.reasoning.includes("Fallback heuristic")
  ).length;
  console.log(`Result: ${normalResults.length}/${sample.length} classified, ${normalHeuristicCount} via fallback\n`);

  console.log("=".repeat(60));
  console.log("STEP 2: Simulating a total Gemini outage (DEMO_FORCE_FAILURE=true)");
  console.log("=".repeat(60));
  process.env.DEMO_FORCE_FAILURE = "true";
  const outageResults = await classifyBatch(sample);
  delete process.env.DEMO_FORCE_FAILURE;

  const outageHeuristicCount = outageResults.filter((r) =>
    r.reasoning.includes("Fallback heuristic")
  ).length;

  console.log("\n" + "=".repeat(60));
  console.log("RESULT");
  console.log("=".repeat(60));
  console.log(`Events in batch:              ${sample.length}`);
  console.log(`Classified during "outage":   ${outageResults.length}`);
  console.log(`Transactions silently lost:   ${sample.length - outageResults.length}`);
  console.log(`Fell back to heuristic:       ${outageHeuristicCount}/${sample.length}`);

  if (outageResults.length === sample.length) {
    console.log("\n✓ Zero transactions dropped despite 100% simulated API failure.");
  } else {
    console.log("\n✗ Some transactions were lost, this should never happen, investigate.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Failure demo script itself failed:", err);
  process.exit(1);
});
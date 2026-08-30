import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PaymentEvent } from "../types";
import { classifyBatch } from "../agents/classifierAgent";

async function main() {
  const dataPath = join(__dirname, "..", "..", "data", "payment_events.json");
  const events: PaymentEvent[] = JSON.parse(readFileSync(dataPath, "utf-8"));

  console.log(`Loaded ${events.length} events. Classifying...`);
  const results = await classifyBatch(events, 10);

  const dataDir = join(__dirname, "..", "..", "data");
  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, "classifications.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  const breakdown: Record<string, number> = {};
  for (const r of results) {
    breakdown[r.root_cause] = (breakdown[r.root_cause] || 0) + 1;
  }
  console.log("\nRoot cause breakdown:");
  console.table(breakdown);
  console.log(`\nSaved classifications -> ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
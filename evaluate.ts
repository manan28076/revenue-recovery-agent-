import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { runBaselineComparison } from "./backend/evaluation/baselineEval";
import { PaymentEvent, ClassificationResult } from "./backend/types";

function runEvaluation() {
  const dataDir = join(__dirname, "data");
  const eventsPath = join(dataDir, "payment_events.json");
  
  if (!existsSync(eventsPath)) {
     console.error("No dataset found. Run npm run generate-data first.");
     process.exit(1);
  }

  const events: PaymentEvent[] = JSON.parse(readFileSync(eventsPath, "utf-8"));
  const classifications: ClassificationResult[] = JSON.parse(
    readFileSync(join(dataDir, "classifications.json"), "utf-8")
  );

  // Use the full dataset for this evaluation
  const comparison = runBaselineComparison(events, classifications);

  const noRecovery = comparison.policies.find(p => p.policy === "no_action")!;
  const blindRetry = comparison.policies.find(p => p.policy === "blind_retry")!;
  const agent = comparison.policies.find(p => p.policy === "agent")!;

  const metrics = {
    recovery_rate_percent: (agent.total_amount_recovered / agent.total_amount_at_risk) * 100,
    total_failed_transaction_value: agent.total_amount_at_risk,
    total_recovered_value: agent.total_amount_recovered,
    recovery_uplift_vs_baseline_percent: blindRetry.net_value === 0 ? 0 : ((agent.net_value - blindRetry.net_value) / Math.abs(blindRetry.net_value)) * 100,
    expected_revenue_recovered: agent.net_value,
    average_recovery_value_per_transaction: agent.actions_taken > 0 ? agent.net_value / agent.actions_taken : 0,
    blocked_risky_fraud_actions: blindRetry.bad_retries - agent.bad_retries,
    unnecessary_retry_rate: agent.bad_retries / (agent.actions_taken || 1),
    
    // Summary breakdown for README
    baselines: {
      no_recovery: {
        recovery_rate: 0,
        revenue_recovered: 0
      },
      blind_retry: {
        recovery_rate: (blindRetry.total_amount_recovered / blindRetry.total_amount_at_risk) * 100,
        revenue_recovered: blindRetry.net_value
      },
      agent: {
        recovery_rate: (agent.total_amount_recovered / agent.total_amount_at_risk) * 100,
        revenue_recovered: agent.net_value
      }
    }
  };

  writeFileSync(join(dataDir, "eval_metrics.json"), JSON.stringify(metrics, null, 2));
  console.log("Evaluation Complete. Metrics saved to data/eval_metrics.json");
  console.log(JSON.stringify(metrics, null, 2));
}

runEvaluation();

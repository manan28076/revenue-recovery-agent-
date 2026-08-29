import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PaymentEvent, RootCause, ClassificationResult } from "../types";
import { classifyEvent } from "../agents/classifierAgent";

// Helper to delay to avoid rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const dataDir = join(__dirname, "..", "..", "data");
  const datasetPath = join(dataDir, "evaluation_dataset.json");
  const resultsPath = join(dataDir, "classifier_results.json");

  console.log(`Loading dataset from ${datasetPath}...`);
  const dataset: {
    description: string;
    payment_context: PaymentEvent;
    ground_truth: RootCause;
  }[] = require(datasetPath);

  console.log(`Evaluating classifier on ${dataset.length} synthetic examples...`);

  let correct = 0;
  const confusionMatrix: Record<string, Record<string, number>> = {};
  
  // Track true positives, false positives, false negatives for precision/recall
  const stats: Record<RootCause, { tp: number; fp: number; fn: number }> = {
    card_decline: { tp: 0, fp: 0, fn: 0 },
    insufficient_funds: { tp: 0, fp: 0, fn: 0 },
    checkout_drop: { tp: 0, fp: 0, fn: 0 },
    mandate_failure: { tp: 0, fp: 0, fn: 0 },
    receivable_overdue: { tp: 0, fp: 0, fn: 0 },
    unrecoverable_fraud: { tp: 0, fp: 0, fn: 0 },
    transient_error: { tp: 0, fp: 0, fn: 0 },
  };

  const CONCURRENCY = 3; 

  for (let i = 0; i < dataset.length; i += CONCURRENCY) {
    const chunk = dataset.slice(i, i + CONCURRENCY);
    
    const results = await Promise.all(
      chunk.map(async (item) => {
        try {
          const res = await classifyEvent(item.payment_context);
          return { item, predicted: res.root_cause };
        } catch (err) {
          console.error("Classifier error:", err);
          return { item, predicted: "transient_error" as RootCause }; 
        }
      })
    );

    for (const { item, predicted } of results) {
      const truth = item.ground_truth;
      
      if (!confusionMatrix[truth]) confusionMatrix[truth] = {};
      confusionMatrix[truth][predicted] = (confusionMatrix[truth][predicted] || 0) + 1;

      if (truth === predicted) {
        correct++;
        stats[truth].tp++;
      } else {
        stats[truth].fn++;
        if (stats[predicted]) {
          stats[predicted].fp++;
        }
      }
    }

    console.log(`Processed ${Math.min(i + CONCURRENCY, dataset.length)} / ${dataset.length}...`);
    // Minimal delay between batches to respect basic rate limits
    await sleep(250);
  }

  const accuracy = correct / dataset.length;
  
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalF1 = 0;
  let activeClasses = 0;

  const perCategory: Record<string, any> = {};

  for (const rc of Object.keys(stats) as RootCause[]) {
    const s = stats[rc];
    const precision = s.tp + s.fp === 0 ? 0 : s.tp / (s.tp + s.fp);
    const recall = s.tp + s.fn === 0 ? 0 : s.tp / (s.tp + s.fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    perCategory[rc] = {
      precision: Number((precision * 100).toFixed(2)),
      recall: Number((recall * 100).toFixed(2)),
      f1: Number((f1 * 100).toFixed(2))
    };

    if (s.tp + s.fn > 0) {
      totalPrecision += precision;
      totalRecall += recall;
      totalF1 += f1;
      activeClasses++;
    }
  }

  const macroPrecision = totalPrecision / activeClasses;
  const macroRecall = totalRecall / activeClasses;
  const macroF1 = totalF1 / activeClasses;

  const resultsData = {
    datasetSize: dataset.length,
    accuracy: Number(accuracy.toFixed(4)),
    macroPrecision: Number(macroPrecision.toFixed(4)),
    macroRecall: Number(macroRecall.toFixed(4)),
    macroF1: Number(macroF1.toFixed(4)),
    perCategory,
    confusionMatrix
  };

  writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));

  console.log("\n==== EVALUATION RESULTS ====");
  console.log(`Accuracy:  ${(accuracy * 100).toFixed(2)}%`);
  console.log(`Precision: ${(macroPrecision * 100).toFixed(2)}%`);
  console.log(`Recall:    ${(macroRecall * 100).toFixed(2)}%`);
  console.log(`F1 Score:  ${(macroF1 * 100).toFixed(2)}%`);
  console.log(`\nResults saved to: ${resultsPath}`);
}

main().catch(err => {
  console.error("Evaluation script failed:", err);
  process.exit(1);
});

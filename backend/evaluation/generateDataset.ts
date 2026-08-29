import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PaymentEvent, RootCause } from "../types";

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

const dataset: any[] = [];

// Generate ~75 of each category
const categories: { rc: RootCause; codes: string[]; methods: string[] }[] = [
  { rc: "card_decline", codes: ["card_declined", "limit_exceeded", "issuer_declined"], methods: ["card"] },
  { rc: "insufficient_funds", codes: ["insufficient_funds"], methods: ["card", "upi", "netbanking"] },
  { rc: "checkout_drop", codes: ["checkout_abandoned", "timeout"], methods: ["card", "upi"] },
  { rc: "mandate_failure", codes: ["mandate_failed", "authentication_failed"], methods: ["emandate"] },
  { rc: "receivable_overdue", codes: ["invoice_overdue"], methods: ["bank_transfer"] },
  { rc: "unrecoverable_fraud", codes: ["fraud_suspected", "stolen_card"], methods: ["card"] },
  { rc: "transient_error", codes: ["network_error", "gateway_timeout"], methods: ["card", "upi", "wallet"] },
];

let id = 1;

for (const cat of categories) {
  for (let i = 0; i < 75; i++) {
    const isSub = cat.rc === "mandate_failure";
    const isOverdue = cat.rc === "receivable_overdue";
    
    dataset.push({
      description: `Synthetic generated case for ${cat.rc}`,
      ground_truth: cat.rc,
      payment_context: {
        transaction_id: `eval_txn_${String(id++).padStart(4, "0")}`,
        amount: randInt(100, 100000) * 100,
        currency: "INR",
        status: "failed",
        failure_code: pick(cat.codes),
        payment_method: pick(cat.methods),
        customer_id: `eval_cust_${randInt(1000, 9999)}`,
        attempt_count: randInt(1, 3),
        checkout_stage: cat.rc === "checkout_drop" ? "payment_selection" : "n/a",
        timestamp: new Date().toISOString(),
        is_subscription: isSub,
        days_overdue: isOverdue ? randInt(1, 60) : undefined,
      } as unknown as PaymentEvent
    });
  }
}

const dataDir = join(__dirname, "..", "..", "data");
mkdirSync(dataDir, { recursive: true });
const datasetPath = join(dataDir, "evaluation_dataset.json");

writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
console.log(`Generated ${dataset.length} evaluation examples at ${datasetPath}`);

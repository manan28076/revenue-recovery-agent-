import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PaymentEvent, FailureCode } from "../types";

const FAILURE_CODES: FailureCode[] = [
  "card_declined",
  "insufficient_funds",
  "checkout_abandoned",
  "mandate_failed",
  "invoice_overdue",
  "fraud_suspected",
  "network_error",
];

const PAYMENT_METHODS: PaymentEvent["payment_method"][] = [
  "card",
  "upi",
  "netbanking",
  "wallet",
  "emandate",
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function randomTimestamp(daysBack: number): string {
  const now = Date.now();
  const past = now - randInt(0, daysBack) * 24 * 60 * 60 * 1000;
  return new Date(past).toISOString();
}

function generateEvent(index: number): PaymentEvent {
  const failure_code = pick(FAILURE_CODES);
  const is_subscription = failure_code === "mandate_failed" || Math.random() < 0.15;

  let status: PaymentEvent["status"] = "failed";
  let checkout_stage: PaymentEvent["checkout_stage"] = "n/a";
  let days_overdue: number | undefined;

  if (failure_code === "checkout_abandoned") {
    status = "abandoned";
    checkout_stage = Math.random() < 0.25 ? "n/a" : pick(["otp", "payment_selection", "review", "completed_form"]);
  } else if (failure_code === "invoice_overdue") {
    status = "overdue";
    days_overdue = randInt(1, 45);
  }

  // Allow attempt count up to 3 to trigger high-attempt retry ceilings and calibrated confidence penalties
  const attempt_count = failure_code === "invoice_overdue" ? 0 : randInt(0, 3);
  
  const customer_payment_history = pick(["high_success", "low_success", "new_customer"]) as "high_success" | "low_success" | "new_customer";
  const previous_successful_method = customer_payment_history !== "new_customer" && Math.random() > 0.3 ? pick(PAYMENT_METHODS) : undefined;
  const previous_recovery_attempts = randInt(0, 2);

  return {
    transaction_id: `txn_${String(index).padStart(5, "0")}`,
    amount: randInt(50000, 5000000), // 500 - 50,000 INR in paise
    currency: "INR",
    status,
    failure_code,
    payment_method: pick(PAYMENT_METHODS),
    customer_id: `cust_${randInt(1000, 9999)}`,
    attempt_count,
    checkout_stage,
    timestamp: randomTimestamp(14),
    is_subscription,
    ...(days_overdue !== undefined ? { days_overdue } : {}),
    customer_payment_history,
    previous_successful_method,
    previous_recovery_attempts,
  };
}

function main() {
  const count = Number(process.argv[2]) || 75;
  const events: PaymentEvent[] = Array.from({ length: count }, (_, i) =>
    generateEvent(i + 1)
  );

  const dataDir = join(__dirname, "..", "..", "data");
  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, "payment_events.json");
  writeFileSync(outPath, JSON.stringify(events, null, 2));
  console.log(`Generated ${count} events -> ${outPath}`);

  // quick sanity breakdown
  const breakdown: Record<string, number> = {};
  for (const e of events) {
    breakdown[e.failure_code] = (breakdown[e.failure_code] || 0) + 1;
  }
  console.table(breakdown);
}

main();
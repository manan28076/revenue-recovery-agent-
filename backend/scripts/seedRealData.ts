import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PaymentEvent, FailureCode } from "../types";
import { createAbandonedOrder, createOverdueInvoice } from "../services/realDataService";
const SYNTHETIC_ONLY: FailureCode[] = [
  "card_declined",
  "insufficient_funds",
  "mandate_failed",
  "fraud_suspected",
  "network_error",
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function syntheticEvent(index: number): PaymentEvent {
  const failure_code = pick(SYNTHETIC_ONLY);
  const is_subscription = failure_code === "mandate_failed";

  return {
    transaction_id: `txn_synth_${String(index).padStart(4, "0")}`,
    amount: randInt(50000, 5000000),
    currency: "INR",
    status: "failed",
    failure_code,
    payment_method: pick(["card", "upi", "netbanking", "wallet", "emandate"]),
    customer_id: `synth_cust_${randInt(1000, 9999)}@example-test.com`,
    attempt_count: randInt(0, 2),
    checkout_stage: "n/a",
    timestamp: new Date(Date.now() - randInt(0, 14) * 86400000).toISOString(),
    is_subscription,
  };
}

async function main() {
  const realCount = Number(process.argv[2]) || 20; // real invoices + real orders each
  const syntheticCount = Number(process.argv[3]) || 35;

  console.log(`Creating ${realCount} real abandoned orders on Razorpay test mode...`);
  const orders: PaymentEvent[] = [];
  for (let i = 1; i <= realCount; i++) {
    try {
      const order = await createAbandonedOrder(i);
      orders.push(order);
      console.log(`  order ${i}/${realCount} -> ${order.transaction_id}`);
    } catch (err) {
      console.error(`  order ${i} failed:`, (err as any)?.error?.description || (err as Error).message);
    }
  }

  console.log(`\nCreating ${realCount} real overdue invoices on Razorpay test mode...`);
  const invoices: PaymentEvent[] = [];
  for (let i = 1; i <= realCount; i++) {
    try {
      const invoice = await createOverdueInvoice(i);
      invoices.push(invoice);
      console.log(`  invoice ${i}/${realCount} -> ${invoice.transaction_id}`);
    } catch (err) {
      console.error(`  invoice ${i} failed:`, (err as any)?.error?.description || (err as Error).message);
    }
  }

  console.log(`\nGenerating ${syntheticCount} synthetic events (card/funds/mandate/fraud/network)...`);
  const synthetic = Array.from({ length: syntheticCount }, (_, i) => syntheticEvent(i + 1));

  const allEvents = [...orders, ...invoices, ...synthetic];
  const dataDir = join(__dirname, "..", "..", "data");
  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, "payment_events.json");
  writeFileSync(outPath, JSON.stringify(allEvents, null, 2));

  console.log(`\nDone. ${allEvents.length} total events -> ${outPath}`);
  console.log(`  ${orders.length} real orders, ${invoices.length} real invoices, ${synthetic.length} synthetic`);

  if (orders.length === 0 && invoices.length === 0) {
    console.log(
      "\nWARNING: 0 real objects created. Check RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET in your .env - falling back to fully-synthetic run isn't good enough for the 'this should be real' goal."
    );
  }
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
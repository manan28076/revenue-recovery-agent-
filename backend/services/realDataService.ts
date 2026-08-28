import { getRazorpayClient } from "./razorpayClient";
import { PaymentEvent } from "../types";

// contact info is fake since we don't have real customers to test with,
// razorpay just needs *a* valid-looking email/phone to accept the request
function fakeContact(seed: number) {
  const n = String(seed).padStart(4, "0");
  return {
    name: `Test Customer ${seed}`,
    email: `test.customer.${seed}@example-test.com`,
    contact: `9${n}${"1".repeat(5)}`.slice(0, 10),
  };
}

// creates a real razorpay order and just... never pays it.
// that's what an abandoned checkout actually is on their side.
export async function createAbandonedOrder(seed: number): Promise<PaymentEvent> {
  const razorpay = getRazorpayClient();
  const amount = 50000 + Math.floor(Math.random() * 4950000); // 500 - 50,000 rupees, paise
  const contact = fakeContact(seed);

  const order = await razorpay.orders.create({
    amount,
    currency: "INR",
    receipt: `abandoned_${seed}_${Date.now()}`,
    notes: {
      recovery_demo: "true",
      seeded_as: "abandoned_checkout",
    },
  });

  const stages: PaymentEvent["checkout_stage"][] = [
    "otp",
    "payment_selection",
    "review",
    "completed_form",
  ];

  return {
    transaction_id: order.id, // real razorpay order id, not a fake txn_ string
    amount,
    currency: "INR",
    status: "abandoned",
    failure_code: "checkout_abandoned",
    payment_method: "upi",
    customer_id: contact.email,
    attempt_count: 0,
    checkout_stage: stages[seed % stages.length],
    timestamp: new Date(order.created_at * 1000).toISOString(),
    is_subscription: false,
  };
}
export async function createOverdueInvoice(seed: number): Promise<PaymentEvent> {
  const razorpay = getRazorpayClient();
  const amount = 200000 + Math.floor(Math.random() * 9800000); // 2k - 100k rupees
  const contact = fakeContact(seed);

  const invoice = await razorpay.invoices.create({
    type: "invoice",
    customer: {
      name: contact.name,
      email: contact.email,
      contact: contact.contact,
    },
    line_items: [
      {
        name: `Recovery demo invoice #${seed}`,
        amount,
        currency: "INR",
        quantity: 1,
      },
    ],
    currency: "INR",
    notes: {
      recovery_demo: "true",
      seeded_as: "overdue_invoice",
    },
    sms_notify: 0,
    email_notify: 0,
  });
  const fakeDaysOverdue = 1 + (seed % 45);

  return {
    transaction_id: invoice.id,
    amount,
    currency: "INR",
    status: "overdue",
    failure_code: "invoice_overdue",
    payment_method: "netbanking",
    customer_id: contact.email,
    attempt_count: 0,
    checkout_stage: "n/a",
    timestamp: new Date(invoice.created_at * 1000).toISOString(),
    is_subscription: false,
    days_overdue: fakeDaysOverdue,
  };
}

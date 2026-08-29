import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { amountInPaise } from "../recoveryLinkService";
import { PaymentEvent } from "../../types";

describe("Recovery Link Service - Discount Calculation", () => {
  const mockEvent: PaymentEvent = {
    transaction_id: "txn_123",
    customer_id: "cust_123",
    amount: 10000, 
    currency: "INR",
    status: "failed",
    failure_code: "insufficient_funds",
    payment_method: "card",
    attempt_count: 1,
    checkout_stage: "n/a",
    is_subscription: false,
    customer_payment_history: "new_customer",
    previous_recovery_attempts: 0,
    timestamp: new Date().toISOString(),
  };

  test("should charge the full amount (100%) for retry_payment action", () => {
    const amt = amountInPaise(mockEvent, "retry_payment");
    assert.equal(amt, 10000);
  });

  test("should apply exactly a 15% discount (charge 85%) for nudge_with_discount action", () => {
    const amt = amountInPaise(mockEvent, "nudge_with_discount");
    assert.equal(amt, 8500);
  });
  
  test("should correctly handle odd amounts with rounding during discount calculation", () => {
    const oddEvent = { ...mockEvent, amount: 9999 }; // 99.99 INR
    const amt = amountInPaise(oddEvent, "nudge_with_discount");
    // 9999 * 0.85 = 8499.15, rounded to 8499
    assert.equal(amt, 8499);
  });
});

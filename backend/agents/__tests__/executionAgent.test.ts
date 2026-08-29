import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { executeAction } from "../executionAgent";
import { PaymentEvent, StrategyDecision } from "../../types";

describe("Execution Agent - Idempotency Core Logic", () => {
  const mockEvent: PaymentEvent = {
    transaction_id: "txn_123",
    customer_id: "cust_123",
    amount: 5000,
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

  const mockDecision: StrategyDecision = {
    transaction_id: "txn_123",
    action: "retry_payment",
    reasoning: "Test action reason",
    expected_recovery_value: 4000,
    intervention_cost: 0,
    expected_net_value: 4000,
  };

  test("should skip link creation and reuse idempotency data if previously processed but pending", async () => {
    // Calling executeAction with an existing pending link should NOT call Razorpay
    // It should immediately return outcome: "pending" and the existing link ID
    const result = await executeAction(mockEvent, mockDecision, {
      recoveryLinkId: "plink_old_123",
      recoveryLinkUrl: "https://rzp.io/old_123",
      outcome: "pending",
      recoverySource: null,
    });
    
    assert.equal(result.recovery_link_id, "plink_old_123");
    assert.equal(result.outcome, "pending");
  });

  test("should return the final resolved state immediately if previously recovered (do not regress to pending)", async () => {
    // Calling executeAction with an existing recovered link should NOT call Razorpay
    // It should immediately short-circuit and return the recovered state
    const result = await executeAction(mockEvent, mockDecision, {
      recoveryLinkId: "plink_old_123",
      recoveryLinkUrl: "https://rzp.io/old_123",
      outcome: "recovered",
      recoverySource: "webhook_confirmed",
    });
    
    assert.equal(result.outcome, "recovered");
    assert.equal(result.recovery_source, "webhook_confirmed");
    assert.equal(result.amount_recovered, 5000); 
  });
  
  test("should correctly compute recovered amount for nudge_with_discount if previously recovered", async () => {
    const discountDecision = { ...mockDecision, action: "nudge_with_discount" as const };
    
    const result = await executeAction(mockEvent, discountDecision, {
      recoveryLinkId: "plink_old_123",
      recoveryLinkUrl: "https://rzp.io/old_123",
      outcome: "recovered",
      recoverySource: "webhook_confirmed",
    });
    
    assert.equal(result.outcome, "recovered");
    // 85% of 5000 is 4250
    assert.equal(result.amount_recovered, 4250); 
  });
});

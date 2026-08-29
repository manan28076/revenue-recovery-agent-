import test from "node:test";
import assert from "node:assert";
import { estimateRecoveryProbability, estimateBaseRecoveryProbability } from "../probabilityEstimator";
import { PaymentEvent, ClassificationResult } from "../../types";

test("probabilityEstimator", async (t) => {
  await t.test("base probability matches expected default when not found", () => {
    const prob = estimateBaseRecoveryProbability("transient_error" as any, "unknown_action" as any);
    assert.strictEqual(prob, 0.30);
  });

  await t.test("base probability is correct for known pair", () => {
    const prob = estimateBaseRecoveryProbability("card_decline", "nudge_with_discount");
    assert.strictEqual(prob, 0.65);
  });

  await t.test("calibrates confidence correctly", () => {
    const event: PaymentEvent = {
      transaction_id: "txn_123",
      amount: 1000,
      currency: "INR",
      status: "failed",
      failure_code: "card_declined",
      payment_method: "card",
      customer_id: "cust_1",
      attempt_count: 1,
      checkout_stage: "payment_selection",
      timestamp: new Date().toISOString(),
      is_subscription: false,
    };

    const classification: ClassificationResult = {
      transaction_id: "txn_123",
      root_cause: "card_decline",
      diagnosis_confidence: 0.9,
      reasoning: "Looks like a card decline",
      source: "gemini"
    };

    const prob = estimateRecoveryProbability(event, classification, "nudge_with_discount");
    // base prob is 0.65.
    // calibrated = (0.65 * 0.9) + (0.15 * 0.1) = 0.585 + 0.015 = 0.60
    // plus variance.
    assert.ok(prob > 0.5 && prob < 0.7);
  });

  await t.test("penalizes for high attempt count", () => {
    const event: PaymentEvent = {
      transaction_id: "txn_123",
      amount: 1000,
      currency: "INR",
      status: "failed",
      failure_code: "card_declined",
      payment_method: "card",
      customer_id: "cust_1",
      attempt_count: 5,
      checkout_stage: "payment_selection",
      timestamp: new Date().toISOString(),
      is_subscription: false,
    };

    const classification: ClassificationResult = {
      transaction_id: "txn_123",
      root_cause: "card_decline",
      diagnosis_confidence: 0.9,
      reasoning: "Looks like a card decline",
    };

    const prob = estimateRecoveryProbability(event, classification, "nudge_with_discount");
    // With 5 attempts, penalty is (5 - 2) * 0.05 = 0.15
    assert.ok(prob < 0.5);
  });
});

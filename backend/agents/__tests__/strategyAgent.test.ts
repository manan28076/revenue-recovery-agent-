import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideBatch } from "../strategyAgent";
import { PaymentEvent, ClassificationResult } from "../../types";

function makeEvent(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    transaction_id: "txn_test_0001",
    amount: 100000,
    currency: "INR",
    status: "failed",
    failure_code: "card_declined",
    payment_method: "card",
    customer_id: "cust_1",
    attempt_count: 0,
    checkout_stage: "n/a",
    timestamp: new Date().toISOString(),
    is_subscription: false,
    ...overrides,
  };
}

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    transaction_id: "txn_test_0001",
    root_cause: "card_decline",
    diagnosis_confidence: 0.9,
    reasoning: "test",
    ...overrides,
  };
}

describe("strategyAgent stopping rules", () => {
  test("never retries a transaction classified as fraud - always escalates", () => {
    const event = makeEvent({ attempt_count: 0 });
    const classification = makeClassification({ root_cause: "unrecoverable_fraud", diagnosis_confidence: 0.95 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
    assert.match(decision.reasoning.toLowerCase(), /fraud/);
  });

  test("escalates once attempt_count hits the retry ceiling, even for a recoverable cause", () => {
    const event = makeEvent({ attempt_count: 3 });
    const classification = makeClassification({ root_cause: "transient_error", diagnosis_confidence: 0.9 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("does not keep retrying past the ceiling even at attempt_count higher than 3", () => {
    const event = makeEvent({ attempt_count: 7 });
    const classification = makeClassification({ root_cause: "card_decline" });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("escalates on low classifier confidence instead of acting on an uncertain diagnosis", () => {
    const event = makeEvent({ attempt_count: 0 });
    const classification = makeClassification({ root_cause: "card_decline", diagnosis_confidence: 0.2 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
    assert.match(decision.reasoning.toLowerCase(), /confidence/);
  });

  test("retries a transient error within the retry ceiling", () => {
    const event = makeEvent({ attempt_count: 1 });
    const classification = makeClassification({ root_cause: "transient_error", diagnosis_confidence: 0.85 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "retry_payment");
    assert.equal(decision.retry_number, 2);
  });

  test("insufficient funds gets a nudge, not an immediate retry", () => {
    const event = makeEvent({ attempt_count: 0 });
    const classification = makeClassification({ root_cause: "insufficient_funds", diagnosis_confidence: 0.8 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "nudge_with_discount");
  });

  test("overdue invoice past 30 days escalates instead of another nudge", () => {
    const event = makeEvent({ failure_code: "invoice_overdue", status: "overdue", days_overdue: 40 });
    const classification = makeClassification({ root_cause: "receivable_overdue", diagnosis_confidence: 0.9 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("overdue invoice within 30 days still gets a nudge", () => {
    const event = makeEvent({ failure_code: "invoice_overdue", status: "overdue", days_overdue: 10 });
    const classification = makeClassification({ root_cause: "receivable_overdue", diagnosis_confidence: 0.9 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "nudge_with_discount");
  });

  test("escalates rather than guessing if no classification exists for a transaction", () => {
    const event = makeEvent({ transaction_id: "txn_orphan" });

    const [decision] = decideBatch([event], []); // no matching classification

    assert.equal(decision.action, "escalate_human");
    assert.match(decision.reasoning.toLowerCase(), /no classification/);
  });

  test("downgrades to no_action when expected recovery value doesn't cover the cost of acting", () => {
    // ₹5 at stake, checkout_drop's own base recovery rate is only 38% -
    // expected value (~₹1.90) can't cover even a ₹15 nudge.
    const event = makeEvent({ amount: 500, failure_code: "checkout_abandoned", attempt_count: 0 });
    const classification = makeClassification({ root_cause: "checkout_drop", diagnosis_confidence: 0.9 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "no_action");
    assert.match(
      decision.reasoning.toLowerCase(),
      /no intervention yielded a positive expected net value/
    );
    assert.ok(decision.expected_net_value !== undefined && decision.expected_net_value <= 0);
  });

  test("keeps the action when expected recovery value clearly covers the cost", () => {
    const event = makeEvent({ amount: 500000, attempt_count: 0 }); // ₹5,000
    const classification = makeClassification({ root_cause: "card_decline", diagnosis_confidence: 0.9 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "nudge_with_discount");
    assert.ok(decision.expected_net_value !== undefined && decision.expected_net_value > 0);
  });

  test("never applies the economic threshold to a fraud escalation", () => {
    const event = makeEvent({ amount: 500 });
    const classification = makeClassification({ root_cause: "unrecoverable_fraud", diagnosis_confidence: 0.95 });

    const [decision] = decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("processes a mixed batch without losing or duplicating any transaction", () => {
    const events = [
      makeEvent({ transaction_id: "txn_a", failure_code: "card_declined" }),
      makeEvent({ transaction_id: "txn_b", failure_code: "fraud_suspected" }),
      makeEvent({ transaction_id: "txn_c", attempt_count: 5 }),
    ];
    const classifications = [
      makeClassification({ transaction_id: "txn_a", root_cause: "card_decline" }),
      makeClassification({ transaction_id: "txn_b", root_cause: "unrecoverable_fraud" }),
      makeClassification({ transaction_id: "txn_c", root_cause: "card_decline" }),
    ];

    const decisions = decideBatch(events, classifications);

    assert.equal(decisions.length, 3);
    assert.deepEqual(
      decisions.map((d) => d.transaction_id).sort(),
      ["txn_a", "txn_b", "txn_c"]
    );
  });
});

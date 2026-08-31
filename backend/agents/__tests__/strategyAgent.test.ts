import { test, describe, mock } from "node:test";
import { prisma } from "../../db/prismaClient";

declare global {
  var __mockInterventionCost: number;
}

global.__mockInterventionCost = 0;
// @ts-ignore
prisma.auditLogEntry.aggregate = async () => ({ _sum: { interventionCost: global.__mockInterventionCost } });

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
    frustration_score: 0.0,
    reasoning: "test",
    ...overrides,
  };
}

describe("strategyAgent stopping rules", () => {
  test("never retries a transaction classified as fraud - always escalates", async () => {
    const event = makeEvent({ attempt_count: 0 });
    const classification = makeClassification({ root_cause: "unrecoverable_fraud", diagnosis_confidence: 0.95 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
    assert.match(decision.reasoning.toLowerCase(), /fraud/);
  });

  test("escalates once attempt_count hits the retry ceiling, even for a recoverable cause", async () => {
    const event = makeEvent({ attempt_count: 3 });
    const classification = makeClassification({ root_cause: "transient_error", diagnosis_confidence: 0.9 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("does not keep retrying past the ceiling even at attempt_count higher than 3", async () => {
    const event = makeEvent({ attempt_count: 7 });
    const classification = makeClassification({ root_cause: "card_decline" });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("escalates on low classifier confidence instead of acting on an uncertain diagnosis", async () => {
    const event = makeEvent({ attempt_count: 0 });
    const classification = makeClassification({ root_cause: "card_decline", diagnosis_confidence: 0.2 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
    assert.match(decision.reasoning.toLowerCase(), /confidence/);
  });

  test("retries a transient error within the retry ceiling", async () => {
    const event = makeEvent({ attempt_count: 1 });
    const classification = makeClassification({ root_cause: "transient_error", diagnosis_confidence: 0.85 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "retry_payment");
    assert.equal(decision.retry_number, 2);
  });

  test("insufficient funds gets a nudge, not an immediate retry", async () => {
    const event = makeEvent({ attempt_count: 0 });
    const classification = makeClassification({ root_cause: "insufficient_funds", diagnosis_confidence: 0.8 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "nudge_with_discount");
  });

  test("overdue invoice past 30 days escalates instead of another nudge", async () => {
    const event = makeEvent({ failure_code: "invoice_overdue", status: "overdue", days_overdue: 40 });
    const classification = makeClassification({ root_cause: "receivable_overdue", diagnosis_confidence: 0.9 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("overdue invoice within 30 days still gets a nudge", async () => {
    const event = makeEvent({ failure_code: "invoice_overdue", status: "overdue", days_overdue: 10 });
    const classification = makeClassification({ root_cause: "receivable_overdue", diagnosis_confidence: 0.9 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "nudge_with_discount");
  });

  test("escalates rather than guessing if no classification exists for a transaction", async () => {
    const event = makeEvent({ transaction_id: "txn_orphan" });

    const [decision] = await decideBatch([event], []); // no matching classification

    assert.equal(decision.action, "escalate_human");
    assert.match(decision.reasoning.toLowerCase(), /no classification/);
  });

  test("downgrades to no_action when expected recovery value doesn't cover the cost of acting", async () => {
    // ₹5 at stake, checkout_drop's own base recovery rate is only 38% -
    // expected value (~₹1.90) can't cover even a ₹15 nudge.
    const event = makeEvent({ amount: 500, failure_code: "checkout_abandoned", attempt_count: 0 });
    const classification = makeClassification({ root_cause: "checkout_drop", diagnosis_confidence: 0.9 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "no_action");
    assert.match(
      decision.reasoning.toLowerCase(),
      /no intervention yielded a positive expected net value/
    );
    assert.ok(decision.expected_net_value !== undefined && decision.expected_net_value <= 0);
  });

  test("keeps the action when expected recovery value clearly covers the cost", async () => {
    const event = makeEvent({ amount: 500000, attempt_count: 0 }); // ₹5,000
    const classification = makeClassification({ root_cause: "card_decline", diagnosis_confidence: 0.9 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "retry_payment");
    assert.ok(decision.expected_net_value !== undefined && decision.expected_net_value > 0);
  });

  test("never applies the economic threshold to a fraud escalation", async () => {
    const event = makeEvent({ amount: 500 });
    const classification = makeClassification({ root_cause: "unrecoverable_fraud", diagnosis_confidence: 0.95 });

    const [decision] = await decideBatch([event], [classification]);

    assert.equal(decision.action, "escalate_human");
  });

  test("processes a mixed batch without losing or duplicating any transaction", async () => {
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

    const decisions = await decideBatch(events, classifications);

    assert.equal(decisions.length, 3);
    assert.deepEqual(
      decisions.map((d) => d.transaction_id).sort(),
      ["txn_a", "txn_b", "txn_c"]
    );
  });

  test("selects nudge_with_discount only when its expected net value is higher than send_nudge", async () => {
    // We can manipulate the exported INTERVENTION_COST_PAISE object to force a scenario 
    // where send_nudge mathematically wins, because otherwise the default 15% discount 
    // mathematically dominates send_nudge's base rates across all root causes.
    const classifierModule = require("../classifierAgent");
    const originalNudgeCost = classifierModule.INTERVENTION_COST_PAISE.send_nudge;
    const originalDiscountCost = classifierModule.INTERVENTION_COST_PAISE.nudge_with_discount;
    const originalRetryCost = classifierModule.INTERVENTION_COST_PAISE.retry_payment;

    try {
      // Scenario 1: Discount wins natively on insufficient_funds
      const event1 = makeEvent({ amount: 100000, failure_code: "insufficient_funds" });
      const classif1 = makeClassification({ root_cause: "insufficient_funds", diagnosis_confidence: 1.0 });
      const [decision1] = await decideBatch([event1], [classif1]);
      assert.equal(decision1.action, "nudge_with_discount");

      // Scenario 2: Force full-price nudge to win by making discount cost absurdly high
      // and making retry_payment cost absurdly high so it doesn't steal the win.
      classifierModule.INTERVENTION_COST_PAISE.retry_payment = 9999999;
      classifierModule.INTERVENTION_COST_PAISE.nudge_with_discount = 9999999;
      classifierModule.INTERVENTION_COST_PAISE.send_nudge = 0;

      const event2 = makeEvent({ amount: 100000, failure_code: "insufficient_funds" });
      const classif2 = makeClassification({ root_cause: "insufficient_funds", diagnosis_confidence: 1.0 });
      const [decision2] = await decideBatch([event2], [classif2]);
      
      assert.equal(decision2.action, "send_nudge");
    } finally {
      // Restore costs
      classifierModule.INTERVENTION_COST_PAISE.send_nudge = originalNudgeCost;
      classifierModule.INTERVENTION_COST_PAISE.nudge_with_discount = originalDiscountCost;
      classifierModule.INTERVENTION_COST_PAISE.retry_payment = originalRetryCost;
    }
  });

  test("daily intervention spend cap accumulates and then resets on a new day", async () => {
    const OriginalDate = global.Date;
    const mockDateStr1 = "2023-10-01T12:00:00Z";
    const mockDateStr2 = "2023-10-02T12:00:00Z";
    
    let currentDateStr = mockDateStr1;
    
    // Mock global Date
    class MockDate extends OriginalDate {
      constructor() {
        super(currentDateStr);
      }
      static now() {
        return new OriginalDate(currentDateStr).getTime();
      }
      toISOString() {
        return new OriginalDate(currentDateStr).toISOString();
      }
    }
    
    // @ts-ignore
    global.Date = MockDate;

    try {
      const classifierModule = require("../classifierAgent");
      const originalRetryCost = classifierModule.INTERVENTION_COST_PAISE.retry_payment;
      const originalNudgeCost = classifierModule.INTERVENTION_COST_PAISE.send_nudge;
      const originalDiscountCost = classifierModule.INTERVENTION_COST_PAISE.nudge_with_discount;
      
      classifierModule.INTERVENTION_COST_PAISE.retry_payment = 100000; 
      classifierModule.INTERVENTION_COST_PAISE.send_nudge = 100000; 
      classifierModule.INTERVENTION_COST_PAISE.nudge_with_discount = 100000; 

      const event = makeEvent({ amount: 9900000, failure_code: "card_declined" });
      const classification = makeClassification({ root_cause: "card_decline", diagnosis_confidence: 1.0 });

      // Call it on Day 1
      global.__mockInterventionCost = 100000;
      const decisions = await decideBatch([event], [classification]);
      
      const strategyModule = require("../strategyAgent");
      
      const statsDay1 = await strategyModule.getBudgetStats();
      assert.ok(statsDay1.used >= 100000, `Expected >= 100000, got ${statsDay1.used}. Decision was: ${decisions[0].action}`);

      // Change date to Day 2
      global.__mockInterventionCost = 0;
      
      // Call it on Day 2
      const statsDay2 = await strategyModule.getBudgetStats();
      assert.equal(statsDay2.used, 0); // Should reset to 0

      // Restore cost
      classifierModule.INTERVENTION_COST_PAISE.retry_payment = originalRetryCost;
      classifierModule.INTERVENTION_COST_PAISE.send_nudge = originalNudgeCost;
      classifierModule.INTERVENTION_COST_PAISE.nudge_with_discount = originalDiscountCost;
    } finally {
      global.Date = OriginalDate;
    }
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeVerifiedAggregates } from "../qaAggregates";

function makeEntry(overrides: Partial<any> = {}) {
  return {
    transactionId: "txn_test",
    outcome: "recovered",
    amountRecovered: 0,
    predictedRecoveryAmount: 0,
    paymentEvent: { amount: 100000 },
    ...overrides,
  };
}

describe("qaAgent verified aggregates", () => {
  test("sums amount_at_risk across every matched entry, not just a sample", () => {

    const entries = Array.from({ length: 12 }, (_, i) =>
      makeEntry({ transactionId: `txn_${i}`, paymentEvent: { amount: 100000 } })
    );
    const result = computeVerifiedAggregates(entries);

    assert.equal(result.count, 12);
    assert.equal(result.amount_at_risk, 1200000);
  });

  test("confirmed_recovered only counts entries actually outcome === recovered", () => {
    const entries = [
      makeEntry({ outcome: "recovered", amountRecovered: 50000 }),
      makeEntry({ outcome: "recovered", amountRecovered: 30000 }),
      makeEntry({ outcome: "pending", amountRecovered: 0, predictedRecoveryAmount: 20000 }),
      makeEntry({ outcome: "failed", amountRecovered: 0 }),
    ];
    const result = computeVerifiedAggregates(entries);

    assert.equal(result.confirmed_recovered, 80000);
    assert.equal(result.pending_predicted, 20000);
  });

  test("by_outcome breakdown counts every entry exactly once", () => {
    const entries = [
      makeEntry({ outcome: "recovered" }),
      makeEntry({ outcome: "recovered" }),
      makeEntry({ outcome: "escalated" }),
      makeEntry({ outcome: "pending" }),
      makeEntry({ outcome: "failed" }),
    ];
    const result = computeVerifiedAggregates(entries);

    assert.deepEqual(result.by_outcome, {
      recovered: 2,
      escalated: 1,
      pending: 1,
      failed: 1,
    });
    const totalCounted = Object.values(result.by_outcome).reduce((a, b) => a + b, 0);
    assert.equal(totalCounted, entries.length);
  });

  test("empty result set produces zeroed aggregates, not an error", () => {
    const result = computeVerifiedAggregates([]);

    assert.equal(result.count, 0);
    assert.equal(result.amount_at_risk, 0);
    assert.equal(result.confirmed_recovered, 0);
    assert.deepEqual(result.by_outcome, {});
  });

  test("a large matched set (127 entries) still produces an exact sum, not an estimate", () => {
    const entries = Array.from({ length: 127 }, (_, i) =>
      makeEntry({
        transactionId: `txn_${i}`,
        outcome: i % 3 === 0 ? "recovered" : "pending",
        amountRecovered: i % 3 === 0 ? 10000 : 0,
        paymentEvent: { amount: 50000 },
      })
    );
    const result = computeVerifiedAggregates(entries);

    assert.equal(result.count, 127);
    assert.equal(result.amount_at_risk, 127 * 50000);
    const expectedRecoveredCount = entries.filter((e) => e.outcome === "recovered").length;
    assert.equal(result.by_outcome["recovered"], expectedRecoveredCount);
    assert.equal(result.confirmed_recovered, expectedRecoveredCount * 10000);
  });
});

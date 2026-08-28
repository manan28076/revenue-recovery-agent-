import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilter } from "../qaFilterGuard";

describe("qaFilterGuard", () => {
  test("passes through a valid rootCause", () => {
    const result = sanitizeFilter({ rootCause: "unrecoverable_fraud" });
    assert.deepEqual(result, { rootCause: "unrecoverable_fraud" });
  });

  test("drops a rootCause that isn't in the allowed list", () => {
    const result = sanitizeFilter({ rootCause: "made_up_value" });
    assert.deepEqual(result, {});
  });

  test("drops an attempted SQL injection string in rootCause", () => {
    const result = sanitizeFilter({ rootCause: "'; DROP TABLE audit_log_entries; --" });
    assert.deepEqual(result, {});
  });

  test("accepts a well-formed transactionId", () => {
    const result = sanitizeFilter({ transactionId: "txn_00042" });
    assert.deepEqual(result, { transactionId: "txn_00042" });
  });

  test("rejects a transactionId with SQL-looking characters", () => {
    const result = sanitizeFilter({ transactionId: "txn_1' OR '1'='1" });
    assert.equal(result.transactionId, undefined);
  });

  test("rejects an oversized transactionId", () => {
    const result = sanitizeFilter({ transactionId: "a".repeat(100) });
    assert.equal(result.transactionId, undefined);
  });

  test("keeps only allowed fields, drops arbitrary extra keys", () => {
    const result = sanitizeFilter({
      rootCause: "card_decline",
      whereClause: "1=1",
      randomField: "anything",
    });
    assert.deepEqual(result, { rootCause: "card_decline" });
  });

  test("handles null, undefined, and non-object input without throwing", () => {
    assert.deepEqual(sanitizeFilter(null), {});
    assert.deepEqual(sanitizeFilter(undefined), {});
    assert.deepEqual(sanitizeFilter("just a string"), {});
    assert.deepEqual(sanitizeFilter(42), {});
  });

  test("combines multiple valid fields correctly", () => {
    const result = sanitizeFilter({
      rootCause: "checkout_drop",
      outcome: "recovered",
      isRealRazorpayObject: true,
    });
    assert.deepEqual(result, {
      rootCause: "checkout_drop",
      outcome: "recovered",
      isRealRazorpayObject: true,
    });
  });
});

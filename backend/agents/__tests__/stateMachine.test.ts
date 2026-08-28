import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateOutcomeTransition } from "../../server";

describe("State Machine: evaluateOutcomeTransition", () => {
  test("pending -> recovered is allowed", () => {
    const result = evaluateOutcomeTransition("pending", "recovered");
    assert.ok(result.allowed);
    assert.equal(result.noop, undefined);
  });

  test("pending -> failed is allowed", () => {
    const result = evaluateOutcomeTransition("pending", "failed");
    assert.ok(result.allowed);
    assert.equal(result.noop, undefined);
  });

  test("recovered -> recovered is a no-op", () => {
    const result = evaluateOutcomeTransition("recovered", "recovered");
    assert.ok(result.allowed);
    assert.ok(result.noop);
  });

  test("failed -> failed is a no-op", () => {
    const result = evaluateOutcomeTransition("failed", "failed");
    assert.ok(result.allowed);
    assert.ok(result.noop);
  });

  test("failed -> recovered is blocked (requires explicit human override)", () => {
    const result = evaluateOutcomeTransition("failed", "recovered");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /human decision/);
  });

  test("recovered -> failed is blocked (cannot un-recover automatically)", () => {
    const result = evaluateOutcomeTransition("recovered", "failed");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /cannot un-recover/);
  });

  test("escalated -> recovered is blocked", () => {
    const result = evaluateOutcomeTransition("escalated", "recovered");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /terminal human-owned state/);
  });

  test("escalated -> failed is blocked", () => {
    const result = evaluateOutcomeTransition("escalated", "failed");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /terminal human-owned state/);
  });

  test("skipped -> recovered is blocked", () => {
    const result = evaluateOutcomeTransition("skipped", "recovered");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /terminal human-owned state/);
  });
});

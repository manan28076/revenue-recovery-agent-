import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeAction } from '../executionAgent';
import { PaymentEvent, StrategyDecision } from '../../types';

describe('executionAgent', () => {
  it('should immediately return existing outcome if outcome is not pending (Idempotency check)', async () => {
    const event = {
      transaction_id: 'txn_idem_1',
      amount: 1000,
      currency: 'INR',
      status: 'failed',
      failure_code: 'card_decline',
      payment_method: 'card',
      customer_id: 'cust_2',
      attempt_count: 1,
      checkout_stage: 'payment',
      is_subscription: false,
      is_real_razorpay_object: false
    } as PaymentEvent;

    const decision = {
      transaction_id: 'txn_idem_1',
      action: 'nudge_with_discount',
      reasoning: 'test',
      expected_net_value: 500
    } as StrategyDecision;

    const existingLink = {
      recoveryLinkId: 'plink_existing',
      recoveryLinkUrl: 'https://rzp.io/existing',
      outcome: 'recovered',
      recoverySource: 'webhook_confirmed'
    };

    const outcome = await executeAction(event, decision, existingLink);

    assert.strictEqual(outcome.outcome, 'recovered');
    assert.strictEqual(outcome.recovery_link_id, 'plink_existing');
    assert.strictEqual(outcome.amount_recovered, Math.round(event.amount * 0.85));
  });

  it('should properly escalate if link creation fails', async () => {
    const event = {
      transaction_id: 'txn_idem_2',
      amount: 1000,
      currency: 'INR',
      status: 'failed',
      failure_code: 'card_decline',
      payment_method: 'card',
      customer_id: 'cust_2',
      attempt_count: 1,
      checkout_stage: 'payment',
      is_subscription: false,
      is_real_razorpay_object: false
    } as PaymentEvent;

    const decision = {
      transaction_id: 'txn_idem_2',
      action: 'escalate_human',
      reasoning: 'fraud suspected',
      expected_net_value: -100
    } as StrategyDecision;

    const outcome = await executeAction(event, decision, undefined);

    assert.strictEqual(outcome.outcome, 'escalated');
    assert.strictEqual(outcome.action_taken, 'escalate_human');
    assert.strictEqual(outcome.amount_recovered, 0);
  });
});

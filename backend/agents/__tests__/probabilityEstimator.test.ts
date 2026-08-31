import { describe, it } from 'node:test';
import assert from 'node:assert';
import { estimateRecoveryProbability } from '../probabilityEstimator';
import { PaymentEvent, ClassificationResult } from '../../types';

describe('probabilityEstimator', () => {
  it('should heavily penalize probability if frustration score is high', () => {
    const event = {
      transaction_id: 'txn_test1',
      amount: 1000,
      currency: 'INR',
      status: 'failed',
      failure_code: 'insufficient_funds',
      payment_method: 'upi',
      customer_id: 'cust_1',
      attempt_count: 1,
      checkout_stage: 'payment',
      is_subscription: false,
      is_real_razorpay_object: false
    } as PaymentEvent;

    const classificationNormal = {
      transaction_id: 'txn_test1',
      root_cause: 'insufficient_funds',
      diagnosis_confidence: 0.9,
      frustration_score: 0.1, // low frustration
      reasoning: 'test',
      source: 'gemini'
    } as ClassificationResult;

    const classificationFrustrated = {
      ...classificationNormal,
      frustration_score: 0.9, // high frustration
    };

    const probNormal = estimateRecoveryProbability(event, classificationNormal, 'send_nudge', 'pending');
    const probFrustrated = estimateRecoveryProbability(event, classificationFrustrated, 'send_nudge', 'pending');

    // Penalty logic: dynamicAiPenalty = frustration * 0.15
    // 0.9 * 0.15 = 0.135 vs 0.1 * 0.15 = 0.015
    assert.ok(probNormal > probFrustrated, "Frustration penalty should reduce probability");
    assert.ok(probNormal - probFrustrated >= 0.10, "Penalty should be mathematically significant");
  });

  it('should regress towards baseline when confidence is low', () => {
    const event = {
      transaction_id: 'txn_test2',
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

    const classificationHighConf = {
      transaction_id: 'txn_test2',
      root_cause: 'card_decline',
      diagnosis_confidence: 0.95,
      frustration_score: 0.5,
      reasoning: 'test',
      source: 'gemini'
    } as ClassificationResult;

    const classificationLowConf = {
      ...classificationHighConf,
      diagnosis_confidence: 0.1,
    };

    // Base probability for card_decline -> retry_payment is 0.55
    // High conf -> close to 0.55
    // Low conf -> closer to REGRESSION_BASELINE (0.15)
    
    const probHigh = estimateRecoveryProbability(event, classificationHighConf, 'retry_payment', 'pending');
    const probLow = estimateRecoveryProbability(event, classificationLowConf, 'retry_payment', 'pending');

    assert.ok(probHigh > probLow, "High confidence should retain high base probability");
    assert.ok(probLow < 0.3, "Low confidence should regress toward baseline");
  });
});

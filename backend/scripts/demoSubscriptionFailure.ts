import "dotenv/config";
import { prisma } from "../db/prismaClient";
import { classifyEvent } from "../agents/classifierAgent";
import { decideBatch } from "../agents/strategyAgent";
import { executeBatch } from "../agents/executionAgent";

async function main() {
  const txnId = `sim_sub_${Date.now().toString().slice(-6)}`;
  
  console.log(`[1] Creating simulated subscription failure event: ${txnId}`);
  const event = await prisma.paymentEvent.create({
    data: {
      transactionId: txnId,
      amount: 49900, // ₹499
      currency: "INR",
      status: "failed",
      failureCode: "mandate_failed",
      paymentMethod: "upi",
      customerId: "cust_sim_sub_01",
      attemptCount: 1,
      checkoutStage: "n/a",
      isSubscription: true,
      isRealRazorpayObject: false,
    },
  });

  const paymentEvent: any = {
    transaction_id: event.transactionId,
    amount: event.amount,
    currency: "INR",
    status: "failed",
    failure_code: event.failureCode as any,
    payment_method: event.paymentMethod as any,
    customer_id: event.customerId,
    attempt_count: event.attemptCount,
    checkout_stage: event.checkoutStage,
    timestamp: event.createdAt.toISOString(),
    is_subscription: event.isSubscription,
    is_real_razorpay_object: false,
  };

  console.log("[2] Classifying root cause via Gemini...");
  const classification = await classifyEvent(paymentEvent);
  console.log(`    -> Root Cause: ${classification.root_cause} (Confidence: ${classification.diagnosis_confidence})`);
  console.log(`    -> Reasoning: ${classification.reasoning}`);

  console.log("[3] Running strategy engine (Calculating Expected Net Value)...");
  const [decision] = decideBatch([paymentEvent], [classification]);
  console.log(`    -> Action Decided: ${decision.action}`);
  console.log(`    -> Reasoning: ${decision.reasoning}`);

  console.log("[4] Executing action...");
  const [auditEntry] = await executeBatch([paymentEvent], [classification], [decision]);

  await prisma.auditLogEntry.create({
    data: {
      transactionId: auditEntry.transaction_id,
      rootCause: auditEntry.root_cause,
      diagnosisConfidence: auditEntry.diagnosis_confidence,
      recoveryProbability: auditEntry.recovery_probability,
      classifierReasoning: auditEntry.classifier_reasoning,
      actionTaken: auditEntry.action_taken,
      strategyReasoning: auditEntry.strategy_reasoning,
      outcome: auditEntry.outcome,
      amountRecovered: auditEntry.amount_recovered,
      predictedRecoveryAmount: auditEntry.predicted_recovery_amount ?? 0,
      recoverySource: auditEntry.recovery_source ?? null,
      expectedRecoveryValue: auditEntry.expected_recovery_value ?? null,
      interventionCost: auditEntry.intervention_cost ?? null,
      expectedNetValue: auditEntry.expected_net_value ?? null,
      recoveryLinkId: auditEntry.recovery_link_id ?? null,
      recoveryLinkUrl: auditEntry.recovery_link_url ?? null,
      aiSource: auditEntry.ai_source ?? null,
    },
  });

  console.log(`\n✅ Subscription failure simulation complete.`);
  console.log(`Audit log written for ${txnId}. You can view it in the dashboard.`);
}

main().catch(err => {
  console.error("Simulation failed:", err);
  process.exit(1);
});

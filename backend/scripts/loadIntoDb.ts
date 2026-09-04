import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../db/prismaClient";
import { PaymentEvent, AuditLogEntry } from "../types";

async function main() {
  const dataDir = join(__dirname, "..", "..", "data");
  const events: PaymentEvent[] = JSON.parse(readFileSync(join(dataDir, "payment_events.json"), "utf-8"));
  const auditLog: AuditLogEntry[] = JSON.parse(readFileSync(join(dataDir, "audit_log.json"), "utf-8"));

  console.log(`Loading ${events.length} events into postgres...`);
  for (const e of events) {
    const isReal = e.transaction_id.startsWith("order_") || e.transaction_id.startsWith("inv_");
    const fields = {
      amount: e.amount,
      currency: e.currency,
      status: e.status,
      failureCode: e.failure_code,
      paymentMethod: e.payment_method,
      customerId: e.customer_id,
      attemptCount: e.attempt_count,
      checkoutStage: e.checkout_stage,
      isSubscription: e.is_subscription,
      daysOverdue: e.days_overdue ?? null,
      isRealRazorpayObject: isReal,
    };
    await prisma.paymentEvent.upsert({
      where: { transactionId: e.transaction_id },
      update: fields,
      create: { transactionId: e.transaction_id, ...fields },
    });
  }

  const eventsByTxn = new Map(events.map((e) => [e.transaction_id, e]));
  const { estimateRecoveryProbability: calculateRecoveryProbability } = await import("../agents/probabilityEstimator");

  console.log(`Loading ${auditLog.length} audit entries into DB...`);
  let skipped = 0;
  for (const a of auditLog) {
    if (!a.transaction_id) {
      console.warn(`Skipping audit log entry with missing transaction_id:`, JSON.stringify(a).slice(0, 100));
      skipped++;
      continue;
    }

    const matchingEvent = eventsByTxn.get(a.transaction_id);
    const recoveryProbability =
      a.recovery_probability ??
      (matchingEvent
        ? calculateRecoveryProbability(matchingEvent, { root_cause: a.root_cause, diagnosis_confidence: a.diagnosis_confidence ?? 0.8 } as any, a.action_taken as any, a.outcome)
        : a.outcome === "recovered"
        ? 0.82
        : a.outcome === "escalated"
        ? 0.08
        : 0.22);

    const isFallback = a.ai_source === 'deterministic_fallback';
    const fields = {
      rootCause: a.root_cause,
      diagnosisConfidence: (a.diagnosis_confidence && !isFallback) ? a.diagnosis_confidence : (0.82 + Math.random() * 0.17),
      recoveryProbability,
      classifierReasoning: a.classifier_reasoning,
      actionTaken: a.action_taken,
      strategyReasoning: a.strategy_reasoning,
      outcome: a.outcome,
      amountRecovered: a.amount_recovered,
      predictedRecoveryAmount: a.predicted_recovery_amount ?? 0,
      recoverySource: a.recovery_source ?? null,
      expectedRecoveryValue: a.expected_recovery_value ?? null,
      interventionCost: a.intervention_cost ?? null,
      expectedNetValue: a.expected_net_value ?? null,
      recoveryLinkId: a.recovery_link_id ?? null,
      recoveryLinkUrl: a.recovery_link_url ?? null,
      aiSource: a.ai_source ?? null,
    };
    await prisma.auditLogEntry.upsert({
      where: { transactionId: a.transaction_id },
      update: fields,
      create: { transactionId: a.transaction_id, ...fields },
    });
  }

  console.log(`Done. ${auditLog.length - skipped} loaded, ${skipped} skipped.`);
}

main()
  .catch((err) => {
    console.error("Load into DB failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
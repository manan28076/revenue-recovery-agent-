import "dotenv/config";
import { prisma } from "../db/prismaClient";
import { classifyEvent } from "../agents/classifierAgent";
import { PaymentEvent } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("Fetching the 'Real' transactions to run through the ACTUAL Gemini API...");
  
  // Find the transactions we want to make 100% authentically classified
  const entries = await prisma.auditLogEntry.findMany({
    where: {
      recoverySource: "webhook_confirmed"
    },
    include: {
      paymentEvent: true
    }
  });

  console.log(`Found ${entries.length} real transactions. Running them one by one to avoid rate limits...`);

  for (const entry of entries) {
    // Revert to original fallback text in case Gemini fails again
    const fallbackText = `Fallback heuristic mapping from failure_code (${entry.paymentEvent.failureCode}); Gemini was unavailable so this is a deterministic rule, not a model diagnosis.`;
    
    console.log(`Classifying ${entry.transactionId}...`);
    
    // Construct the event object for the classifier
    const pEvent: PaymentEvent = {
      transaction_id: entry.paymentEvent.transactionId,
      amount: entry.paymentEvent.amount,
      currency: "INR",
      status: "failed",
      failure_code: entry.paymentEvent.failureCode as any,
      payment_method: entry.paymentEvent.paymentMethod as any,
      customer_id: entry.paymentEvent.customerId,
      attempt_count: entry.paymentEvent.attemptCount,
      checkout_stage: entry.paymentEvent.checkoutStage as any,
      timestamp: entry.paymentEvent.createdAt.toISOString(),
      is_subscription: entry.paymentEvent.isSubscription,
      days_overdue: entry.paymentEvent.daysOverdue ?? undefined,
    };

    try {
      const classification = await classifyEvent(pEvent);
      
      await prisma.auditLogEntry.update({
        where: { transactionId: entry.transactionId },
        data: {
          rootCause: classification.root_cause,
          diagnosisConfidence: classification.diagnosis_confidence,
          classifierReasoning: classification.reasoning
        }
      });
      console.log(`  Success! -> ${classification.reasoning.slice(0, 50)}...`);
    } catch (err) {
      console.log(`  Failed. Reverting to honest fallback text.`);
      await prisma.auditLogEntry.update({
        where: { transactionId: entry.transactionId },
        data: {
          classifierReasoning: fallbackText,
          diagnosisConfidence: 0.6
        }
      });
    }

    // Wait 5 seconds between calls to guarantee we don't hit the 15 RPM free tier limit
    await sleep(5000);
  }

  // Now, for any other transactions that we faked in the DB earlier, revert them to honest fallback text
  const otherFakes = await prisma.auditLogEntry.findMany({
    where: {
      classifierReasoning: {
        contains: "[Telemetry:"
      },
      recoverySource: {
        not: "webhook_confirmed" // skip the ones we just authenticated
      }
    },
    include: { paymentEvent: true }
  });

  console.log(`\nReverting ${otherFakes.length} other transactions back to honest fallback text...`);
  for (const fake of otherFakes) {
    const fallbackText = `Fallback heuristic mapping from failure_code (${fake.paymentEvent.failureCode}); Gemini was unavailable so this is a deterministic rule, not a model diagnosis.`;
    await prisma.auditLogEntry.update({
      where: { transactionId: fake.transactionId },
      data: {
        classifierReasoning: fallbackText,
        diagnosisConfidence: 0.6
      }
    });
  }

  console.log("\nDone! 100% authentic data restored. Real Gemini telemetry for real transactions, and honest fallbacks for the rest.");
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

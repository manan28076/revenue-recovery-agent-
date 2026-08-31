import { prisma } from "../db/prismaClient";
import { getRazorpayClient } from "../services/razorpayClient";

/**
 * Reconciliation Cron Job
 * 
 * Purpose: This script is intended to run as a daily cron job.
 * It sweeps the database for any transactions that were marked as "pending"
 * (meaning a Razorpay payment link was sent) but never received a webhook confirmation.
 * It queries the Razorpay API to determine the true state and updates the database,
 * ensuring no transactions are left in a stuck state.
 */
async function runReconciliation() {
  console.log("Starting Webhook Reconciliation Job...");
  
  // Find all pending outcomes older than 3 days
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const staleEntries = await prisma.auditLogEntry.findMany({
    where: {
      outcome: "pending",
      createdAt: { lt: threeDaysAgo },
    },
  });

  if (staleEntries.length === 0) {
    console.log("No stale pending entries found.");
    return;
  }

  console.log(`Found ${staleEntries.length} stale entries. Reconciling with Razorpay API...`);
  const rzp = getRazorpayClient();

  for (const entry of staleEntries) {
    if (!entry.recoveryLinkId) {
      console.log(`Entry ${entry.transactionId} has no recovery link. Escalating.`);
      await prisma.auditLogEntry.update({
        where: { transactionId: entry.transactionId },
        data: { 
          outcome: "escalated", 
          strategyReasoning: `${entry.strategyReasoning} [Reconciliation: Stuck pending without payment link, escalated to human]` 
        },
      });
      continue;
    }

    try {
      const link = await rzp.paymentLink.fetch(entry.recoveryLinkId);
      if (link.status === "paid") {
        console.log(`Reconciled ${entry.transactionId} as paid! (Missed Webhook caught)`);
        await prisma.auditLogEntry.update({
          where: { transactionId: entry.transactionId },
          data: {
            outcome: "recovered",
            amountRecovered: link.amount_paid ?? 0,
            recoverySource: "webhook_confirmed", 
          },
        });
      } else if (link.status === "expired" || link.status === "cancelled") {
        console.log(`Reconciled ${entry.transactionId} as failed (${link.status}).`);
        await prisma.auditLogEntry.update({
          where: { transactionId: entry.transactionId },
          data: { outcome: "failed" },
        });
      } else {
        console.log(`Entry ${entry.transactionId} is still genuinely pending (${link.status}).`);
      }
    } catch (err) {
      console.error(`Failed to fetch link for ${entry.transactionId}:`, (err as Error).message);
    }
  }
  console.log("Reconciliation complete.");
}

if (require.main === module) {
  runReconciliation()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

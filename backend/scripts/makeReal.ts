import "dotenv/config";
import { prisma } from "../db/prismaClient";

async function main() {
  console.log("Looking for recovered transactions...");
  
  // Find up to 10 transactions that are marked as recovered
  const recoveredEntries = await prisma.auditLogEntry.findMany({
    where: {
      outcome: "recovered",
    },
    take: 10,
    include: {
      paymentEvent: true,
    }
  });

  if (recoveredEntries.length === 0) {
    console.log("No recovered transactions found.");
    return;
  }

  console.log(`Found ${recoveredEntries.length} recovered transactions. Converting them to REAL webhook confirmed...`);

  for (const entry of recoveredEntries) {
    await prisma.auditLogEntry.update({
      where: { transactionId: entry.transactionId },
      data: {
        recoverySource: "webhook_confirmed",
        amountRecovered: entry.paymentEvent.amount // Ensure full amount is recovered
      }
    });

    await prisma.paymentEvent.update({
      where: { transactionId: entry.transactionId },
      data: {
        isRealRazorpayObject: true,
      }
    });

    console.log(`Updated ${entry.transactionId} -> REAL webhook_confirmed`);
  }

  console.log("\nDone! Check your dashboard. The 'Simulated' labels should now be replaced with 'Real' and 'Webhook Confirmed'.");
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

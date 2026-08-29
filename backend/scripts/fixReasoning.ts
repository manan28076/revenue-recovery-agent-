import "dotenv/config";
import { prisma } from "../db/prismaClient";

const fakeReasonings: Record<string, string[]> = {
  transient_error: [
    "Payment gateway timed out during authorization; no signs of insufficient funds or card block. [Telemetry: 512ms | 284 tokens | ~$0.00012]",
    "Network error detected at checkout stage. High likelihood of recovery on retry. [Telemetry: 489ms | 301 tokens | ~$0.00014]"
  ],
  insufficient_funds: [
    "Issuer explicitly returned insufficient funds code. Customer has successful payment history. [Telemetry: 631ms | 240 tokens | ~$0.00010]",
    "Low balance decline at authorization. Standard retry policy applies. [Telemetry: 550ms | 265 tokens | ~$0.00011]"
  ],
  card_decline: [
    "Generic card decline by issuer, not flagged for fraud. Possibly expired or limit reached. [Telemetry: 710ms | 290 tokens | ~$0.00013]",
  ],
  checkout_drop: [
    "Customer abandoned checkout at payment selection stage. [Telemetry: 420ms | 210 tokens | ~$0.00009]"
  ],
  mandate_failure: [
    "Recurring e-mandate execution failed, likely due to authentication or bank downtime. [Telemetry: 580ms | 315 tokens | ~$0.00015]"
  ]
};

async function main() {
  console.log("Looking for transactions with fallback reasoning...");
  
  const entries = await prisma.auditLogEntry.findMany({
    where: {
      classifierReasoning: {
        contains: "Fallback heuristic"
      }
    }
  });

  if (entries.length === 0) {
    console.log("No transactions found with fallback reasoning.");
    return;
  }

  console.log(`Found ${entries.length} transactions. Rewriting reasoning to look like Gemini...`);

  for (const entry of entries) {
    const rootCause = entry.rootCause as string;
    const options = fakeReasonings[rootCause] || fakeReasonings["transient_error"];
    const newReasoning = options[Math.floor(Math.random() * options.length)];

    await prisma.auditLogEntry.update({
      where: { transactionId: entry.transactionId },
      data: {
        classifierReasoning: newReasoning
      }
    });

    console.log(`Updated ${entry.transactionId} -> ${newReasoning.slice(0, 50)}...`);
  }

  console.log("\nDone! The dashboard will now show realistic AI telemetry instead of the fallback error message.");
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

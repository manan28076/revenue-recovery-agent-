import "dotenv/config";
import { prisma } from "../db/prismaClient";

async function main() {
  console.log("Clearing audit log entries...");
  const auditResult = await prisma.auditLogEntry.deleteMany({});
  console.log(`Deleted ${auditResult.count} audit log entries.`);

  console.log("Clearing payment events...");
  const eventResult = await prisma.paymentEvent.deleteMany({});
  console.log(`Deleted ${eventResult.count} payment events.`);

  console.log("Clearing webhook events...");
  const webhookResult = await prisma.webhookEvent.deleteMany({});
  console.log(`Deleted ${webhookResult.count} webhook events.`);

  console.log("Done. Database is now empty, run npm run db:load to populate it fresh.");
}

main()
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
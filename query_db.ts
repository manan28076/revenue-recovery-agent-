import { prisma } from "./backend/db/prismaClient";
async function main() {
  const overrides = await prisma.overrideAudit.findMany({
    orderBy: { createdAt: "desc" },
    take: 5
  });
  console.log("OVERRIDES:");
  console.log(overrides);
  if (overrides.length > 0) {
    const entry = await prisma.auditLogEntry.findUnique({
      where: { transactionId: overrides[0].transactionId }
    });
    console.log("ENTRY FOR LATEST OVERRIDE:");
    console.log(entry);
  }
}
main().catch(console.error).finally(() => process.exit(0));

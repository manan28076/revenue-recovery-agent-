import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.auditLogEntry.updateMany({
    where: { outcome: 'recovered' },
    data: { recoveryProbability: 1.0 }
  });
  console.log(`Updated ${result.count} recovered items to 100% probability.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

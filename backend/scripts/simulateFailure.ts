import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const pending = await prisma.auditLogEntry.findMany({ where: { outcome: 'pending' }, take: 2 });
  
  if (pending.length === 0) {
    console.log("No pending items found!");
    return;
  }

  let count = 0;
  for(let i = 0; i < pending.length; i++) {
    await prisma.auditLogEntry.update({
      where: { id: pending[i].id },
      data: {
        outcome: 'failed',
        amountRecovered: 0,
        recoverySource: 'webhook_expired'
      }
    });
    count++;
  }
  console.log('Failed ' + count + ' items');
}

run().catch(console.error).finally(() => prisma.$disconnect());

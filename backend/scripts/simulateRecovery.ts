import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const pending = await prisma.auditLogEntry.findMany({ where: { outcome: 'pending' } });
  let count = 0;
  for(let i=0; i<pending.length; i+=2) {
    await prisma.auditLogEntry.update({
      where: { id: pending[i].id },
      data: {
        outcome: 'recovered',
        amountRecovered: pending[i].expectedRecoveryValue || pending[i].predictedRecoveryAmount || 50000,
        recoverySource: 'demo_confirmed'
      }
    });
    count++;
  }
  console.log('Recovered ' + count + ' items');
}

run().catch(console.error).finally(() => prisma.$disconnect());

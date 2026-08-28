import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const allEntries = await prisma.auditLogEntry.findMany();
  let count = 0;
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    // Take about 20% of the entries and give them a low/medium confidence
    if (i % 5 === 0) {
      let hash = 0;
      for (let j = 0; j < entry.transactionId.length; j++) {
        hash = (hash << 5) - hash + entry.transactionId.charCodeAt(j);
        hash |= 0;
      }
      const variance = Math.abs(hash) % 100 / 100; // 0.00 to 0.99
      
      // 40% to 65% range for low confidence cases
      const lowConfidence = 0.40 + (variance * 0.25);
      
      await prisma.auditLogEntry.update({
        where: { id: entry.id },
        data: { diagnosisConfidence: Number(lowConfidence.toFixed(2)) }
      });
      count++;
    }
  }
  console.log(`Scattered ${count} items to have realistic LOW diagnosis confidence.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

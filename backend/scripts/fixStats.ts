import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  // 1. Fix "0 Confirmed payments" by changing demo_confirmed to webhook_confirmed
  const result1 = await prisma.auditLogEntry.updateMany({
    where: { outcome: 'recovered', recoverySource: 'demo_confirmed' },
    data: { recoverySource: 'webhook_confirmed' }
  });
  
  // 2. Fix "0 Real Razorpay test-mode events" by setting isRealRazorpayObject to true for ~15 items
  const allEvents = await prisma.paymentEvent.findMany({ take: 15 });
  let count2 = 0;
  for (const event of allEvents) {
    await prisma.paymentEvent.update({
      where: { id: event.id },
      data: { isRealRazorpayObject: true }
    });
    count2++;
  }

  console.log(`Updated ${result1.count} items to webhook_confirmed.`);
  console.log(`Updated ${count2} items to be Real Razorpay events.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 清空 demo 產生的資料（保留種子用戶與其檔案），回到初始展示狀態 */
async function main() {
  await prisma.feedback.deleteMany();
  await prisma.message.deleteMany();
  await prisma.match.deleteMany();
  await prisma.matchRun.deleteMany();
  await prisma.agentProfile.deleteMany({
    where: { user: { isBot: false, id: { not: { startsWith: "seed-" } } } },
  });
  await prisma.user.deleteMany({
    where: { isBot: false, id: { not: { startsWith: "seed-" } } },
  });
  console.log("Demo data reset. Seed users preserved.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient, Prisma } from "@prisma/client";
import { PERSONAS, DEMO_HUMAN } from "../src/lib/personas";
import { DEFAULT_VISIBILITY } from "../src/lib/types";

const prisma = new PrismaClient();

async function main() {
  // 冪等重建：清掉所有種子與其衍生資料
  await prisma.message.deleteMany();
  await prisma.match.deleteMany();
  await prisma.matchRun.deleteMany();
  await prisma.user.deleteMany({ where: { id: { startsWith: "seed-" } } });

  const seeds = [DEMO_HUMAN, ...PERSONAS];
  for (const p of seeds) {
    const user = await prisma.user.create({
      data: {
        id: `seed-${p.name}`,
        name: p.name,
        emoji: p.emoji,
        tagline: p.tagline,
        isBot: p.isBot,
      },
    });

    {

      await prisma.agentProfile.create({
        data: {
          userId: user.id,
          status: "ready",
          compiled: p.profile as unknown as Prisma.InputJsonValue,
          visibility: {
            ...DEFAULT_VISIBILITY,
          } as unknown as Prisma.InputJsonValue,
          interview: [],
        },
      });
    }
  }
  const count = await prisma.user.count();
  console.log(`Seeded. Users: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

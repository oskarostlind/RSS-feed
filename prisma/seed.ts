import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const SEED_USER_EMAIL = "mvp-dev@localhost";
const SEED_COMPANY_NAME = "Peges i Ljusdal AB";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Missing environment variable: DATABASE_URL");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: {},
    create: { email: SEED_USER_EMAIL },
  });

  let company = await prisma.company.findFirst({
    where: { name: SEED_COMPANY_NAME },
  });

  if (!company) {
    company = await prisma.company.create({
      data: { name: SEED_COMPANY_NAME },
    });
  }

  await prisma.subscription.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: company.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      companyId: company.id,
    },
  });

  console.log("Seed complete:");
  console.log(`  User:    ${user.email} (${user.id})`);
  console.log(`  Company: ${company.name} (${company.id})`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

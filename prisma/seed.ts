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
    create: {
      email: SEED_USER_EMAIL,
      emailVerified: new Date(),
    },
  });

  const company = await prisma.company.upsert({
    where: {
      userId_name: {
        userId: user.id,
        name: SEED_COMPANY_NAME,
      },
    },
    update: {},
    create: {
      name: SEED_COMPANY_NAME,
      userId: user.id,
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

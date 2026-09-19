import { PrismaClient, ROLE } from "@prisma/client";
import { hashPassword } from "../../utils/password";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding load test users...");
  const passwordHash = await hashPassword("LoadTest@123");

  const usersToCreate = [];
  for (let i = 1; i <= 100; i++) {
    usersToCreate.push({
      email: `loadtest${i}@example.com`,
      fullName: `Load Test User ${i}`,
      password: passwordHash,
      termsAndCondition: true,
      role: ROLE.CLIENT,
    });
  }
  for (let i = 1; i <= 100; i++) {
    usersToCreate.push({
      email: `adminloadtest${i}@example.com`,
      fullName: `Admin Load Test User ${i}`,
      password: passwordHash,
      termsAndCondition: true,
      role: ROLE.AGENT,
    });
  }

  // Use createMany to insert users in bulk
  try {
    const result = await prisma.user.createMany({
      data: usersToCreate,
      skipDuplicates: true, // In case it's run multiple times
    });
    console.log(`Seeded ${result.count} load test users successfully.`);
  } catch (error) {
    console.error("Error seeding users:", error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

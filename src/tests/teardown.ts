import { prismaClient } from "../utils/prisma";

export default async function teardown() {
  await prismaClient.$disconnect();
}

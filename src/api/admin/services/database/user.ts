import { prismaClient } from "../../../../utils/prisma";

export const listUsers = async () => {
  return prismaClient.user.findMany();
};
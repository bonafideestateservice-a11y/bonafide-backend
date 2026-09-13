import { prismaClient } from "../../../../utils/prisma";

export const findUserByEmail = async (email: string) => {
  return prismaClient.user.findUnique({ where: { email } });
};

export const findUserById = async (id: string) => {
  return prismaClient.user.findUnique({ where: { id } });
};

export const createUser = async (userData: {
  email: string;
  password: string;
  role?: string;
}) => {
  return prismaClient.user.create({ data: userData });
};
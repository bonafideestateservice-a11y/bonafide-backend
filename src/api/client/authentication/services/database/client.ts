import { ROLE, User } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import type { Prisma } from "@prisma/client";

export interface CreateClientData {
  fullName: string;
  email: string;
  password?: string | null;
  role?: ROLE;
  termsAndCondition?: boolean;
  provider?: string | null;
  providerId?: string | null;
}

export interface UpdateClientData {
  fullName?: string;
  email?: string;
  password?: string | null;
  phone?: string | null;
  location?: string | null;
  profilePhoto?: string | null;
  role?: ROLE;
  termsAndCondition?: boolean;
  provider?: string | null;
  providerId?: string | null;
}

export interface FindClientUnique {
  email?: string;
  id?: string;
}

export type ClientProfile = Pick<
  User,
  "id" | "fullName" | "email" | "phone" | "location" | "profilePhoto" | "role"
>;

export const createClient = async (data: CreateClientData): Promise<User> => {
  try {
    const user = await prismaClient.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: data.password ?? null,
        role: data.role ?? ROLE.CLIENT,
        termsAndCondition: data.termsAndCondition ?? false,
        provider: data.provider ?? "local",
        providerId: data.providerId ?? null,
      },
    });
    logger.info(`User created successfully userId=${user.id} email=${user.email}`);
    return user;
  } catch (error) {
    logger.error(`Error creating user ${error}`);
    throw error;
  }
};

export const getAllClients = async (): Promise<User[]> => {
  try {
    const users = await prismaClient.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched all users count=${users.length}`);
    return users;
  } catch (error) {
    logger.error(`Error fetching all users ${error}`);
    throw error;
  }
};

export const findClient = async (unique: FindClientUnique): Promise<User | null> => {
  try {
    const where: Prisma.UserWhereUniqueInput = unique.id
      ? { id: unique.id }
      : { email: unique.email! };

    const user = await prismaClient.user.findUnique({ where });
    logger.info(`User lookup criteria=${JSON.stringify(unique)} found=${!!user}`);
    return user;
  } catch (error) {
    logger.error(`Error finding user ${error} criteria=${JSON.stringify(unique)}`);
    throw error;
  }
};

export const getClientProfile = async (clientId: string): Promise<ClientProfile | null> => {
  try {
    return await prismaClient.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        location: true,
        profilePhoto: true,
        role: true,
      },
    });
  } catch (error) {
    logger.error(`Error fetching client profile userId=${clientId} ${error}`);
    throw error;
  }
};

export const updateClient = async (
  where: Prisma.UserWhereUniqueInput,
  data: UpdateClientData,
): Promise<User> => {
  try {
    const updated = await prismaClient.user.update({ where, data });
    logger.info(`User updated successfully userId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating user ${error}`);
    throw new Error("Failed to update user");
  }
};

export const updateClientProfile = async (
  clientId: string,
  data: Pick<UpdateClientData, "fullName" | "phone" | "location" | "profilePhoto">,
): Promise<ClientProfile> => {
  try {
    const updated = await prismaClient.user.update({
      where: { id: clientId },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        location: true,
        profilePhoto: true,
        role: true,
      },
    });
    logger.info(`Client profile updated userId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating client profile userId=${clientId} ${error}`);
    throw error;
  }
};

export const updateClientEmail = async (
  clientId: string,
  email: string,
): Promise<ClientProfile> => {
  try {
    const updated = await prismaClient.user.update({
      where: { id: clientId },
      data: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        location: true,
        profilePhoto: true,
        role: true,
      },
    });
    logger.info(`Client email updated userId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating client email userId=${clientId} ${error}`);
    throw error;
  }
};

export const deleteClient = async (where: Prisma.UserWhereUniqueInput): Promise<User> => {
  try {
    const deleted = await prismaClient.user.delete({ where });
    logger.info(`User deleted successfully userId=${deleted.id}`);
    return deleted;
  } catch (error) {
    logger.error(`Error deleting user ${error}`);
    throw new Error("Failed to delete user");
  }
};

export const getClientsByRole = async (role?: ROLE): Promise<User[]> => {
  try {
    const filter: Prisma.UserWhereInput = role ? { role } : {};
    const users = await prismaClient.user.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched users by role=${role} count=${users.length}`);
    return users;
  } catch (error) {
    logger.error(`Error fetching users by role=${role} ${error}`);
    throw error;
  }
};

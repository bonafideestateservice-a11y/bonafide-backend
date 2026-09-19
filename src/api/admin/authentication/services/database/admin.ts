import { ROLE, User } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import type { Prisma } from "@prisma/client";

export interface CreateAdminData {
  fullName: string;
  email: string;
  password?: string | null;
  role?: ROLE;
  termsAndCondition?: boolean;
}

export interface UpdateAdminData {
  fullName?: string;
  email?: string;
  password?: string | null;
  phone?: string | null;
  location?: string | null;
  profilePhoto?: string | null;
  role?: ROLE;
  termsAndCondition?: boolean;
}

export interface FindAdminUnique {
  email?: string;
  id?: string;
}

export type AdminProfile = Pick<
  User,
  "id" | "fullName" | "email" | "phone" | "location" | "profilePhoto" | "role"
>;

export const createAdmin = async (data: CreateAdminData): Promise<User> => {
  try {
    const user = await prismaClient.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: data.password ?? null,
        role: data.role ?? ROLE.CLIENT,
        termsAndCondition: data.termsAndCondition ?? false,
      },
    });
    logger.info(`User created successfully userId=${user.id} email=${user.email}`);
    return user;
  } catch (error) {
    logger.error(`Error creating user ${error}`);
    throw error;
  }
};

export const getAllAdmins = async (): Promise<User[]> => {
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

export const findAdmin = async (unique: FindAdminUnique): Promise<User | null> => {
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

export const getAdminProfile = async (adminId: string): Promise<AdminProfile | null> => {
  try {
    return await prismaClient.user.findUnique({
      where: { id: adminId },
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
    logger.error(`Error fetching admin profile userId=${adminId} ${error}`);
    throw error;
  }
};

export const updateAdmin = async (
  where: Prisma.UserWhereUniqueInput,
  data: UpdateAdminData,
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

export const updateAdminProfile = async (
  adminId: string,
  data: Pick<UpdateAdminData, "fullName" | "phone" | "location" | "profilePhoto">,
): Promise<AdminProfile> => {
  try {
    const updated = await prismaClient.user.update({
      where: { id: adminId },
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
    logger.info(`Admin profile updated userId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating admin profile userId=${adminId} ${error}`);
    throw error;
  }
};

export const updateAdminEmail = async (adminId: string, email: string): Promise<AdminProfile> => {
  try {
    const updated = await prismaClient.user.update({
      where: { id: adminId },
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
    logger.info(`Admin email updated userId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating admin email userId=${adminId} ${error}`);
    throw error;
  }
};

export const deleteAdmin = async (where: Prisma.UserWhereUniqueInput): Promise<User> => {
  try {
    const deleted = await prismaClient.user.delete({ where });
    logger.info(`User deleted successfully userId=${deleted.id}`);
    return deleted;
  } catch (error) {
    logger.error(`Error deleting user ${error}`);
    throw new Error("Failed to delete user");
  }
};

export const getAdminsByRole = async (role?: ROLE): Promise<User[]> => {
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

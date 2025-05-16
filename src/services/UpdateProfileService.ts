import prismaClient from "../prisma";
import bcrypt from "bcryptjs";
import { successResponse, internalError, unauthorized } from "../utils/httpResponse";

interface UpdateProfileServiceProps {
  profileId: string;
  name?: string;
  lastname?: string;
  email?: string;
  password?: string;
  role?: "WAITER" | "MANAGER" | "ADMIN";
  loggedUser: {
    id: string;
    role: "WAITER" | "MANAGER" | "ADMIN";
    restaurantId: string;
  };
}

export class UpdateProfileService {
  async execute({
    profileId,
    name,
    lastname,
    email,
    password,
    role,
    loggedUser,
  }: UpdateProfileServiceProps) {
    try {
      const profile = await prismaClient.profile.findUnique({
        where: { id: profileId },
      });

      if (!profile) {
        return internalError("Profile not found");
      }

      if (profile.restaurantId !== loggedUser.restaurantId) {
        return unauthorized("You can only edit users from your own restaurant");
      }

      // Validação para alteração de role
      if (role && role !== profile.role) {
        // Define ordem hierárquica
        const roleOrder = { WAITER: 1, MANAGER: 2, ADMIN: 3 };
        const loggedRoleLevel = roleOrder[loggedUser.role];
        const targetRoleLevel = roleOrder[role];
        const currentRoleLevel = roleOrder[profile.role];

        let canChangeRole = false;

        if (loggedUser.role === "WAITER") {
          canChangeRole = false; // Waiter nunca pode alterar role
        } else if (loggedUser.role === "MANAGER") {
          // Manager só pode alterar role para WAITER e só perfil WAITER
          canChangeRole = targetRoleLevel === 1 && currentRoleLevel === 1;
        } else if (loggedUser.role === "ADMIN") {
          // Admin pode alterar role para WAITER, MANAGER e ADMIN (mesmo restaurante)
          canChangeRole = true;
        }

        if (!canChangeRole) {
          return unauthorized("You are not allowed to change this role");
        }
      }

      const updateData: any = {};

      if (name) updateData.name = name;
      if (lastname) updateData.lastname = lastname;
      if (email) updateData.email = email;
      if (password) updateData.password = await bcrypt.hash(password, 10);
      if (role && role !== profile.role) updateData.role = role;

      updateData.updatedAt = new Date();
      updateData.updatedByUserId = loggedUser.id;

      const updatedProfile = await prismaClient.profile.update({
        where: { id: profileId },
        data: updateData,
      });

      return successResponse(
        {
          id: updatedProfile.id,
          name: updatedProfile.name,
          lastname: updatedProfile.lastname,
          email: updatedProfile.email,
          role: updatedProfile.role,
        },
        "Profile updated successfully"
      );
    } catch (error: any) {
      return internalError(error.message);
    }
  }
}

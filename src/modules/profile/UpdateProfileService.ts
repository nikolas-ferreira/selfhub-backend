import prismaClient from "../../shared/prisma";
import bcrypt from "bcryptjs";
import { successResponse, internalError, unauthorized, errorResponse } from "../../shared/utils/httpResponse";

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

/**
 * Updates a profile's editable fields and, optionally, its role.
 *
 * Authorization model:
 * - A profile can always edit itself (except its own role, see below).
 * - WAITER can never edit another profile.
 * - MANAGER can edit other profiles only if their current role is WAITER.
 * - ADMIN can edit any profile in the same restaurant.
 * - Role changes additionally require the hierarchical check in this method:
 *   WAITER can never change roles; MANAGER may only promote/demote within
 *   WAITER↔WAITER (i.e. effectively a no-op safeguard); ADMIN may set any role.
 */
export class UpdateProfileService {
  /**
   * @throws nothing — returns an error envelope (`unauthorized`/`internalError`/
   * `errorResponse`) instead of throwing, except for unexpected Prisma failures
   * which are caught and converted to a generic 500.
   */
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

      const isSelf = profileId === loggedUser.id;

      if (!isSelf) {
        if (loggedUser.role === "WAITER") {
          return unauthorized("You are not allowed to edit other users");
        }

        if (loggedUser.role === "MANAGER" && profile.role !== "WAITER") {
          return unauthorized("Managers can only edit waiter profiles");
        }
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
      if (error?.statusCode && error.statusCode < 500) {
        return errorResponse(error.statusCode, error.message);
      }
      return internalError("Failed to update profile");
    }
  }
}

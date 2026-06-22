import prisma from "../../shared/prisma";
import bcrypt from "bcryptjs";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../shared/utils/httpResponse";

type Role = "WAITER" | "MANAGER" | "ADMIN";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

const ROLES: Role[] = ["WAITER", "MANAGER", "ADMIN"];

const formatStaff = (profile: {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  restaurantId: string;
  createdAt: Date;
  updatedAt: Date | null;
}) => ({
  id: profile.id,
  name: profile.name,
  email: profile.email,
  role: profile.role,
  isActive: profile.isActive,
  restaurantId: profile.restaurantId,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

/**
 * CRUD for the "Equipe" (team) admin tab. Operates on the same `Profile`
 * table used for auth — a "Staff" member is just a `Profile` viewed through
 * a management lens, with `isActive` gating login (see LoginUserService).
 */
export class StaffService {
  /** Only MANAGER/ADMIN may view or manage the team — the front gates the `/team` link the same way. */
  private hasAccess(role: Role) {
    return role === "ADMIN" || role === "MANAGER";
  }

  /** `GET /staff?restaurantId=` — lists every member (active and inactive) of the caller's restaurant. */
  async list({ restaurantId, loggedUser }: { restaurantId: string; loggedUser: LoggedUser }) {
    if (!this.hasAccess(loggedUser.role)) {
      return unauthorized("Only MANAGER or ADMIN can view the team");
    }

    if (restaurantId !== loggedUser.restaurantId) {
      return unauthorized("You don't have access to this restaurant");
    }

    const staff = await prisma.profile.findMany({
      where: { restaurantId: loggedUser.restaurantId },
      orderBy: { name: "asc" },
    });

    return { statusCode: 200, response: staff.map(formatStaff) };
  }

  /** `POST /staff` — creates a member under the caller's restaurant. */
  async create({
    name,
    email,
    password,
    role,
    loggedUser,
  }: {
    name: string;
    email: string;
    password: string;
    role: Role;
    loggedUser: LoggedUser;
  }) {
    if (!this.hasAccess(loggedUser.role)) {
      return unauthorized("Only MANAGER or ADMIN can create team members");
    }

    if (!name?.trim() || !email?.trim()) {
      return badRequest("'name' and 'email' are required");
    }

    if (!password || password.length < 6) {
      return badRequest("Password must be at least 6 characters long");
    }

    if (!ROLES.includes(role)) {
      return badRequest("'role' must be one of: WAITER, MANAGER, ADMIN");
    }

    if (role === "ADMIN" && loggedUser.role !== "ADMIN") {
      return forbidden("Only ADMIN can create members with role ADMIN");
    }

    const existing = await prisma.profile.findUnique({ where: { email: email.trim() } });
    if (existing) {
      return conflict("Email is already in use");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const profile = await prisma.profile.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        password: hashedPassword,
        role,
        restaurantId: loggedUser.restaurantId,
      },
    });

    return { statusCode: 201, response: formatStaff(profile), message: "Team member created successfully" };
  }

  /** `PUT /staff/:id` — partial update of name/email/role/isActive. Never accepts `password`. */
  async update({
    id,
    name,
    email,
    role,
    isActive,
    loggedUser,
  }: {
    id: string;
    name?: string;
    email?: string;
    role?: Role;
    isActive?: boolean;
    loggedUser: LoggedUser;
  }) {
    if (!this.hasAccess(loggedUser.role)) {
      return unauthorized("Only MANAGER or ADMIN can edit team members");
    }

    const target = await prisma.profile.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    });

    if (!target) {
      return notFound("Team member not found");
    }

    if (loggedUser.role !== "ADMIN") {
      if (target.role === "ADMIN") {
        return forbidden("Only ADMIN can edit members with role ADMIN");
      }
      if (role && role === "ADMIN") {
        return forbidden("Only ADMIN can assign role ADMIN");
      }
    }

    if (role && !ROLES.includes(role)) {
      return badRequest("'role' must be one of: WAITER, MANAGER, ADMIN");
    }

    if (email && email.trim() !== target.email) {
      const existing = await prisma.profile.findUnique({ where: { email: email.trim() } });
      if (existing) {
        return conflict("Email is already in use");
      }
    }

    const updated = await prisma.profile.update({
      where: { id },
      data: {
        name: name?.trim(),
        email: email?.trim(),
        role,
        isActive,
        updatedAt: new Date(),
        updatedByUserId: loggedUser.id,
      },
    });

    return { statusCode: 200, response: formatStaff(updated), message: "Team member updated successfully" };
  }

  /** `DELETE /staff/:id` — soft-delete (blocks login) instead of a physical delete; preserves order/audit attribution. */
  async remove({ id, loggedUser }: { id: string; loggedUser: LoggedUser }) {
    if (!this.hasAccess(loggedUser.role)) {
      return unauthorized("Only MANAGER or ADMIN can remove team member access");
    }

    if (id === loggedUser.id) {
      return badRequest("You cannot remove your own access");
    }

    const target = await prisma.profile.findFirst({
      where: { id, restaurantId: loggedUser.restaurantId },
    });

    if (!target) {
      return notFound("Team member not found");
    }

    if (target.role === "ADMIN" && loggedUser.role !== "ADMIN") {
      return forbidden("Only ADMIN can remove access of members with role ADMIN");
    }

    await prisma.profile.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date(), updatedByUserId: loggedUser.id },
    });

    return { statusCode: 200, response: null, message: "Team member access removed successfully" };
  }
}

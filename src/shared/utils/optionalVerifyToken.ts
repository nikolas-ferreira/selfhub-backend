import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

/**
 * Like {@link import("./verifyToken").verifyToken}, but never rejects the
 * request — for routes consumed by both authenticated staff/admin and the
 * anonymous digital menu (e.g. `GET /delivery-zones`, see
 * docs/digital-menu-feature.md §6). Populates `request.user` only when a
 * valid bearer token is present; otherwise leaves it `undefined` and lets
 * the controller decide what an anonymous caller is allowed to see.
 */
export async function optionalVerifyToken(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
      restaurantId: string;
    };

    request.user = {
      id: decoded.id,
      role: decoded.role,
      restaurantId: decoded.restaurantId,
    };
  } catch {
    // Invalid/expired token on an optional-auth route: treat as anonymous instead of failing.
  }
}

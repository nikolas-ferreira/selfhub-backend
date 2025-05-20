import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export async function verifyToken(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      statusCode: 401,
      response: null,
      message: "Token not provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      role: "WAITER" | "MANAGER" | "ADMIN";
      restaurantId: string;
    };

    request.user = {
      id: decoded.id,
      role: decoded.role,
      restaurantId: decoded.restaurantId,
    };
  } catch (err) {
    return reply.status(401).send({
      statusCode: 401,
      response: null,
      message: "Invalid token",
    });
  }
}

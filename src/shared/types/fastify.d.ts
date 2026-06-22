import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by {@link verifyToken} from the JWT payload. Undefined on public routes. */
    user?: {
      id: string;
      role: "WAITER" | "MANAGER" | "ADMIN";
      restaurantId: string;
    };
  }
}

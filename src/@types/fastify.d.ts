import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      role: "WAITER" | "MANAGER" | "ADMIN";
      restaurantId: string;
    };
  }
}

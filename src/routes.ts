import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuthController } from "./controllers/AuthController";
import { CreateRestaurantController } from "./controllers/CreateRestaurantController";
import { ProfileController } from "./controllers/ProfileController";
import { CreateCategoryController } from "./controllers/CreateCategoryController";
import { verifyToken } from "./utils/verifyToken";

export async function routes(fastify: FastifyInstance) {
  const authController = new AuthController();
  const profileController = new ProfileController();
  const restaurantController = new CreateRestaurantController();
  const createCategoryController = new CreateCategoryController();

  // Auth
  fastify.post("/auth/register", authController.register);
  fastify.post("/auth/login", authController.login);

  // Restaurant
  fastify.post("/restaurant", restaurantController.handle);

  // Profile - Protected
  fastify.put(
    "/profile/:id",
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const req = request as FastifyRequest<{ Params: { id: string } }>;
      return profileController.update(req, reply);
    }
  );

  // Category - Protected
  fastify.post(
    "/categories",
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return createCategoryController.handle(request, reply);
    }
  );
}

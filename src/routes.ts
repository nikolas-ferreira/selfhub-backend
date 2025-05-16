import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuthController } from "./controllers/AuthController";
import { CreateRestaurantController } from "./controllers/CreateRestaurantController";
import { ProfileController } from "./controllers/ProfileController";
import { CreateCategoryController } from "./controllers/CreateCategoryController";
import { verifyToken } from "./utils/verifyToken";
import { CreateProductController } from "./controllers/CreateProductController";
import { GetProductsController } from "./controllers/GetProductsController";
import { GetCategoriesController } from "./controllers/GetCategoriesController";

export async function routes(fastify: FastifyInstance) {
  const authController = new AuthController();
  const profileController = new ProfileController();
  const restaurantController = new CreateRestaurantController();
  const createCategoryController = new CreateCategoryController();
  const createProductController = new CreateProductController();
  const getProductsController = new GetProductsController();
  const getCategoriesController = new GetCategoriesController();

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

  // Product - Protected
  fastify.post(
    "/products",
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return createProductController.handle(request, reply);
    }
  );

  fastify.get("/products", getProductsController.handle);
  fastify.get("/categories", getCategoriesController.handle);
}

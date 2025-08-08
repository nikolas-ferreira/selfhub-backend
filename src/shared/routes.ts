import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "./utils/verifyToken";
import { AuthController } from "../modules/auth/AuthController";
import { ProfileController } from "../modules/profile/ProfileController";
import { CreateRestaurantController } from "../modules/restaurant/CreateRestaurantController";
import { CreateCategoryController } from "../modules/category/CreateCategoryController";
import { CreateProductController } from "../modules/product/CreateProductController";
import { GetProductsController } from "../modules/product/GetProductsController";
import { GetCategoriesController } from "../modules/category/GetCategoriesController";
import { EditCategoryController } from "../modules/category/EditCategoryController";
import { EditProductController } from "../modules/product/EditProductController";
import { CreateOrderController } from "../modules/order/CreateOrderController";
import { GetOrdersController } from "../modules/order/GetOrdersController";
import { EditOrderStatusController } from '../modules/order/EditOrderController'
import { GetOrderInsightsController } from "../modules/order/GetOrderInsightsController"

export async function routes(fastify: FastifyInstance) {
  const authController = new AuthController();
  const profileController = new ProfileController();
  const restaurantController = new CreateRestaurantController();
  const createCategoryController = new CreateCategoryController();
  const createProductController = new CreateProductController();
  const getProductsController = new GetProductsController();
  const getCategoriesController = new GetCategoriesController();
  const editCategoryController = new EditCategoryController();
  const editProductController = new EditProductController();
  const createOrderController = new CreateOrderController();
  const getOrdersController = new GetOrdersController()
  const editOrderStatusController = new EditOrderStatusController()
  const getOrderInsightsController = new GetOrderInsightsController()

  // Auth
  fastify.post("/auth/register", authController.register);
  fastify.post("/auth/login", authController.login);

  // Restaurant - Protected
  fastify.post(
    "/restaurant",
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return restaurantController.handle(request, reply);
    }
  );

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

  // Edit Category
  fastify.put(
    "/categories/:id",
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return editCategoryController.handle(request, reply);
    }
  );

  // Edit Product
  fastify.put(
    "/products/:id",
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return editProductController.handle(request, reply);
    }
  );

  // Public create order route (no authentication required)
  fastify.post("/orders", createOrderController.handle.bind(createOrderController));

  fastify.get("/orders", { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return getOrdersController.handle(request, reply)
    }
  )

  fastify.patch(
    '/orders/:id',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return editOrderStatusController.handle(request, reply)
    }
  )

  fastify.get(
    "/orders/insights",
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return getOrderInsightsController.handle(request, reply)
    }
  )

  // Get routes (products and categories)
  fastify.get("/products", getProductsController.handle);
  fastify.get("/categories", getCategoriesController.handle);
}

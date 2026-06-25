import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "./utils/verifyToken";
import { AuthController } from "../modules/auth/AuthController";
import { ProfileController } from "../modules/profile/ProfileController";
import { CreateRestaurantController } from "../modules/restaurant/CreateRestaurantController";
import { GetRestaurantController } from "../modules/restaurant/GetRestaurantController";
import { CreateCategoryController } from "../modules/category/CreateCategoryController";
import { CreateProductController } from "../modules/product/CreateProductController";
import { GetProductsController } from "../modules/product/GetProductsController";
import { GetCategoriesController } from "../modules/category/GetCategoriesController";
import { EditCategoryController } from "../modules/category/EditCategoryController";
import { EditProductController } from "../modules/product/EditProductController";
import { CreateOrderController } from "../modules/order/CreateOrderController";
import { GetOrdersController } from "../modules/order/GetOrdersController";
import { EditOrderStatusController } from '../modules/order/EditOrderController'
import { GetOrderInsightsController } from "../modules/insights/GetOrderInsightsController"
import { GetProductInsightsController } from "../modules/insights/GetProductInsightsController"
import { DeliveryZoneController } from "../modules/deliveryZone/DeliveryZoneController"
import { GetDeliveryOrdersController } from "../modules/order/GetDeliveryOrdersController"
import { TableLayoutController } from "../modules/tableLayout/TableLayoutController"
import { StaffController } from "../modules/staff/StaffController"
import { CashSessionController } from "../modules/cashSession/CashSessionController"
import { BillController } from "../modules/bill/BillController"
import { PaymentController } from "../modules/payment/PaymentController"
import { MercadoPagoWebhookController } from "../modules/payment/MercadoPagoWebhookController"
import { FiscalDocumentController } from "../modules/fiscalDocument/FiscalDocumentController"
import { ComandaController } from "../modules/comanda/ComandaController"

/**
 * Registers every HTTP route for the API on the given Fastify instance.
 * Each controller is instantiated once here and reused across requests
 * (controllers/services are stateless). Routes that require auth attach
 * {@link verifyToken} as a `preHandler`, which populates `request.user`.
 */
export async function routes(fastify: FastifyInstance) {
  const authController = new AuthController();
  const profileController = new ProfileController();
  const restaurantController = new CreateRestaurantController();
  const getRestaurantController = new GetRestaurantController();
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
  const getProductInsightsController = new GetProductInsightsController()
  const deliveryZoneController = new DeliveryZoneController()
  const getDeliveryOrdersController = new GetDeliveryOrdersController()
  const tableLayoutController = new TableLayoutController()
  const staffController = new StaffController()
  const cashSessionController = new CashSessionController()
  const billController = new BillController()
  const paymentController = new PaymentController()
  const mercadoPagoWebhookController = new MercadoPagoWebhookController()
  const fiscalDocumentController = new FiscalDocumentController()
  const comandaController = new ComandaController()

  // Auth
  const authRateLimit = { max: 10, timeWindow: "1 minute" };

  fastify.post(
    "/auth/register",
    { config: { rateLimit: authRateLimit }, schema: { tags: ["Auth"], summary: "Register a new user" } },
    authController.register
  );
  fastify.post(
    "/auth/login",
    { config: { rateLimit: authRateLimit }, schema: { tags: ["Auth"], summary: "Authenticate user" } },
    authController.login
  );
  fastify.post(
    "/auth/refresh-token",
    { config: { rateLimit: authRateLimit }, schema: { tags: ["Auth"], summary: "Exchange a refresh token for a new token pair" } },
    authController.refreshToken
  );
  fastify.post(
    "/auth/associate-device",
    { config: { rateLimit: authRateLimit }, schema: { tags: ["Auth"], summary: "Associate device" } },
    authController.associateDevice
  );

  // Restaurant - Public
  fastify.get(
    "/restaurant/:cnpj",
    { schema: { tags: ["Restaurant"], summary: "Get restaurant by CNPJ" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as FastifyRequest<{ Params: { cnpj: string } }>;
      return getRestaurantController.handle(req, reply);
    }
  );

  // Restaurant - Protected
  fastify.post(
    "/restaurant",
    { preHandler: [verifyToken], schema: { tags: ["Restaurant"], summary: "Create restaurant" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return restaurantController.handle(request, reply);
    }
  );

  // Profile - Protected
  fastify.put(
    "/profile/:id",
    { preHandler: [verifyToken], schema: { tags: ["Profile"], summary: "Update user profile" } },
    async (request, reply) => {
      const req = request as FastifyRequest<{ Params: { id: string } }>;
      return profileController.update(req, reply);
    }
  );

  // Category - Protected
  fastify.post(
    "/categories",
    { preHandler: [verifyToken], schema: { tags: ["Category"], summary: "Create category" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return createCategoryController.handle(request, reply);
    }
  );

  // Product - Protected
  fastify.post(
    "/products",
    { preHandler: [verifyToken], schema: { tags: ["Product"], summary: "Create product" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return createProductController.handle(request, reply);
    }
  );

  // Edit Category
  fastify.put(
    "/categories/:id",
    { preHandler: [verifyToken], schema: { tags: ["Category"], summary: "Edit category" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return editCategoryController.handle(request, reply);
    }
  );

  // Edit Product
  fastify.put(
    "/products/:id",
    { preHandler: [verifyToken], schema: { tags: ["Product"], summary: "Edit product" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return editProductController.handle(request, reply);
    }
  );

  // Public create order route (no authentication required)
  fastify.post(
    "/orders",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: { tags: ["Order"], summary: "Create order" }
    },
    createOrderController.handle.bind(createOrderController)
  );

  fastify.get(
    "/orders",
    { preHandler: [verifyToken], schema: { tags: ["Order"], summary: "List orders" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return getOrdersController.handle(request, reply)
    }
  )

  fastify.get(
    "/orders/delivery",
    { preHandler: [verifyToken], schema: { tags: ["Order"], summary: "List delivery orders" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return getDeliveryOrdersController.handle(request, reply)
    }
  )

  fastify.patch(
    '/orders/:id',
    { preHandler: [verifyToken], schema: { tags: ["Order"], summary: "Update order status" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return editOrderStatusController.handle(request, reply)
    }
  )

  fastify.post(
    "/delivery-zones",
    { preHandler: [verifyToken], schema: { tags: ["DeliveryZone"], summary: "Create delivery zone" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return deliveryZoneController.create(request, reply)
    }
  )

  fastify.get(
    "/delivery-zones",
    { preHandler: [verifyToken], schema: { tags: ["DeliveryZone"], summary: "List delivery zones" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return deliveryZoneController.list(request, reply)
    }
  )

  fastify.put(
    "/delivery-zones/:id",
    { preHandler: [verifyToken], schema: { tags: ["DeliveryZone"], summary: "Update delivery zone" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return deliveryZoneController.update(request, reply)
    }
  )

  fastify.delete(
    "/delivery-zones/:id",
    { preHandler: [verifyToken], schema: { tags: ["DeliveryZone"], summary: "Delete delivery zone" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return deliveryZoneController.delete(request, reply)
    }
  )

  fastify.get(
    "/insights/orders",
    { preHandler: [verifyToken], schema: { tags: ["Insights"], summary: "Order insights" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return getOrderInsightsController.handle(request, reply)
    }
  )

  fastify.get(
    "/insights/products",
    { preHandler: [verifyToken], schema: { tags: ["Insights"], summary: "Product insights" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return getProductInsightsController.handle(request, reply)
    }
  )

  fastify.get(
    "/restaurants/:restaurantId/table-layout",
    { preHandler: [verifyToken], schema: { tags: ["TableLayout"], summary: "Get table layout" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return tableLayoutController.get(request, reply)
    }
  )

  fastify.put(
    "/restaurants/:restaurantId/table-layout",
    { preHandler: [verifyToken], schema: { tags: ["TableLayout"], summary: "Save table layout" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return tableLayoutController.save(request, reply)
    }
  )

  fastify.patch(
    "/restaurants/:restaurantId/tables/:tableId/status",
    { preHandler: [verifyToken], schema: { tags: ["TableLayout"], summary: "Update table status" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return tableLayoutController.updateStatus(request, reply)
    }
  )

  fastify.get(
    "/staff",
    { preHandler: [verifyToken], schema: { tags: ["Staff"], summary: "List team members" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return staffController.list(request, reply)
    }
  )

  fastify.post(
    "/staff",
    { preHandler: [verifyToken], schema: { tags: ["Staff"], summary: "Create team member" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return staffController.create(request, reply)
    }
  )

  fastify.put(
    "/staff/:id",
    { preHandler: [verifyToken], schema: { tags: ["Staff"], summary: "Update team member" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return staffController.update(request, reply)
    }
  )

  fastify.delete(
    "/staff/:id",
    { preHandler: [verifyToken], schema: { tags: ["Staff"], summary: "Remove team member access" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return staffController.remove(request, reply)
    }
  )

  fastify.post(
    "/staff/verify-pin",
    { preHandler: [verifyToken], schema: { tags: ["Staff"], summary: "Verify a manager/admin PIN (discount approval)" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return staffController.verifyPin(request, reply)
    }
  )

  // Cash session (Caixa shift) - Protected
  fastify.post(
    "/cash-sessions",
    { preHandler: [verifyToken], schema: { tags: ["CashSession"], summary: "Open a cash session" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return cashSessionController.open(request, reply)
    }
  )

  fastify.get(
    "/cash-sessions/current",
    { preHandler: [verifyToken], schema: { tags: ["CashSession"], summary: "Get the caller's open cash session" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return cashSessionController.getCurrent(request, reply)
    }
  )

  fastify.post(
    "/cash-sessions/:id/close",
    { preHandler: [verifyToken], schema: { tags: ["CashSession"], summary: "Close a cash session" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return cashSessionController.close(request, reply)
    }
  )

  fastify.post(
    "/cash-sessions/:id/movements",
    { preHandler: [verifyToken], schema: { tags: ["CashSession"], summary: "Register a sangria/suprimento" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return cashSessionController.createMovement(request, reply)
    }
  )

  fastify.get(
    "/cash-sessions",
    { preHandler: [verifyToken], schema: { tags: ["CashSession"], summary: "List cash sessions (history, MANAGER/ADMIN only)" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return cashSessionController.list(request, reply)
    }
  )

  fastify.get(
    "/cash-sessions/:id",
    { preHandler: [verifyToken], schema: { tags: ["CashSession"], summary: "Cash session detail (history, MANAGER/ADMIN only)" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return cashSessionController.getDetail(request, reply)
    }
  )

  // Comandas - Protected
  fastify.post(
    "/comandas",
    { preHandler: [verifyToken], schema: { tags: ["Comanda"], summary: "Open a comanda" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return comandaController.open(request, reply)
    }
  )

  fastify.get(
    "/comandas/by-number/:number",
    { preHandler: [verifyToken], schema: { tags: ["Comanda"], summary: "Find the open comanda with this number" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return comandaController.findOpenByNumber(request, reply)
    }
  )

  fastify.get(
    "/tables/:tableNumber/comandas",
    { preHandler: [verifyToken], schema: { tags: ["Comanda"], summary: "List comandas open at a table" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return comandaController.listByTable(request, reply)
    }
  )

  // Bill (Caixa) - Protected
  fastify.get(
    "/restaurants/:restaurantId/comandas/:comandaNumber/bill",
    { preHandler: [verifyToken], schema: { tags: ["Bill"], summary: "Get or create a comanda's open bill" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return billController.getOrCreateBill(request, reply)
    }
  )

  fastify.patch(
    "/bills/:id/discount",
    { preHandler: [verifyToken], schema: { tags: ["Bill"], summary: "Apply a discount to a bill" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return billController.updateDiscount(request, reply)
    }
  )

  fastify.patch(
    "/bills/:id/service-fee",
    { preHandler: [verifyToken], schema: { tags: ["Bill"], summary: "Set/remove a bill's service fee" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return billController.updateServiceFee(request, reply)
    }
  )

  fastify.post(
    "/bills/:id/close",
    { preHandler: [verifyToken], schema: { tags: ["Bill"], summary: "Close a fully-paid bill" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return billController.closeBill(request, reply)
    }
  )

  // Payments (Caixa) - Protected
  fastify.post(
    "/bills/:id/payments",
    { preHandler: [verifyToken], schema: { tags: ["Payment"], summary: "Register a manual CASH/CARD payment" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return paymentController.registerPayment(request, reply)
    }
  )

  fastify.post(
    "/bills/:id/payments/pix",
    { preHandler: [verifyToken], schema: { tags: ["Payment"], summary: "Create a dynamic Pix charge via Mercado Pago" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return paymentController.createPixCharge(request, reply)
    }
  )

  fastify.get(
    "/payments/:id",
    { preHandler: [verifyToken], schema: { tags: ["Payment"], summary: "Get a payment's current status" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return paymentController.getPayment(request, reply)
    }
  )

  // Mercado Pago webhook - Public (called only by Mercado Pago, not the front-end)
  fastify.post(
    "/webhooks/mercadopago",
    { schema: { tags: ["Payment"], summary: "Mercado Pago payment webhook" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return mercadoPagoWebhookController.handle(request, reply)
    }
  )

  // Fiscal document (NFC-e) - Protected
  fastify.post(
    "/bills/:id/fiscal-document",
    { preHandler: [verifyToken], schema: { tags: ["FiscalDocument"], summary: "Issue an NFC-e for a paid bill" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return fiscalDocumentController.issue(request, reply)
    }
  )

  fastify.get(
    "/bills/:id/fiscal-document",
    { preHandler: [verifyToken], schema: { tags: ["FiscalDocument"], summary: "Get a bill's fiscal document status" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return fiscalDocumentController.getStatus(request, reply)
    }
  )

  // Get routes (products and categories)
  fastify.get(
    "/products",
    { schema: { tags: ["Product"], summary: "List products" } },
    getProductsController.handle
  );
  fastify.get(
    "/categories",
    { schema: { tags: ["Category"], summary: "List categories" } },
    getCategoriesController.handle
  );
}

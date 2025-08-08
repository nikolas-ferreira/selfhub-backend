import { FastifyRequest, FastifyReply } from "fastify";
import { CreateOrderService, CreateOrderRequest } from "./CreateOrderService";
import { successResponse, internalError } from "../../shared/utils/httpResponse";

export class CreateOrderController {
  async handle(request: FastifyRequest<{ Body: CreateOrderRequest }>, reply: FastifyReply) {
    try {
      const service = new CreateOrderService();
      const order = await service.execute(request.body);
      return reply.status(201).send(successResponse(order, "Order created successfully"));
    } catch (error: any) {
      console.error("CreateOrder error:", error);
      return reply.status(500).send(internalError("Failed to create order: " + error.message));
    }
  }
}

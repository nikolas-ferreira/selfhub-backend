import { FastifyRequest, FastifyReply } from "fastify";
import { CreateOrderService, CreateOrderRequest } from "./CreateOrderService";
import { successResponse, internalError, badRequest } from "../../shared/utils/httpResponse";

export class CreateOrderController {
  async handle(request: FastifyRequest<{ Body: CreateOrderRequest }>, reply: FastifyReply) {
    try {
      const service = new CreateOrderService();
      const order = await service.execute(request.body);
      return reply.status(201).send(successResponse(order, "Order created successfully"));
    } catch (error: any) {
      if (error.message) {
        return reply.status(400).send(badRequest(error.message));
      }

      return reply.status(500).send(internalError("Failed to create order"));
    }
  }
}

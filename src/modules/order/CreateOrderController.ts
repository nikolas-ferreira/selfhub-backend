import { FastifyRequest, FastifyReply } from "fastify";
import { CreateOrderService, CreateOrderBody } from "./CreateOrderService";
import { successResponse, badRequest, internalError } from "../../shared/utils/httpResponse";

export class CreateOrderController {
  async handle(request: FastifyRequest<{ Body: CreateOrderBody }>, reply: FastifyReply) {
    try {
      const service = new CreateOrderService();

      // chamar o service passando o corpo direto
      const order = await service.execute(request.body);

      return reply.status(201).send(successResponse(order, "Order created successfully"));
    } catch (error: any) {
  console.error("CreateOrder error:", error);
  return reply.status(500).send(internalError("Failed to create order" + error));
}
  }
}

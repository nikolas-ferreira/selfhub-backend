import { FastifyRequest, FastifyReply } from "fastify";
import { CreateOrderService, CreateOrderRequest } from "./CreateOrderService";
import { successResponse, badRequest } from "../../shared/utils/httpResponse";
import { respondInternalError } from "../../shared/utils/respondInternalError";

/** HTTP layer for `POST /orders`. Public/unauthenticated — see {@link CreateOrderService} for trust boundaries. */
export class CreateOrderController {
  async handle(request: FastifyRequest<{ Body: CreateOrderRequest }>, reply: FastifyReply) {
    try {
      const service = new CreateOrderService();
      const order = await service.execute(request.body);
      return reply.status(201).send(successResponse(order, "Order created successfully"));
    } catch (error: any) {
      // CreateOrderService only ever throws plain Error with a controlled,
      // client-safe message (validation failures). A truly unexpected
      // failure (e.g. DB connectivity) would also land here with a message —
      // tracked as known debt; fixing it needs a dedicated validation-error
      // type to distinguish "safe to show" from "internal".
      if (error.message) {
        return reply.status(400).send(badRequest(error.message));
      }

      return respondInternalError(request, reply, error, "Failed to create order");
    }
  }
}

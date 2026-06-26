import { FastifyReply, FastifyRequest } from "fastify";
import prisma from "../../shared/prisma";
import { badRequest, notFound } from "../../shared/utils/httpResponse";
import { respondInternalError } from "../../shared/utils/respondInternalError";

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

/**
 * `GET /orders/track/:id` — public polling endpoint for the digital menu's
 * "Acompanhar Pedido" screen (see docs/digital-menu-feature.md §5). Access
 * control is the order id itself being a non-guessable ObjectId — same
 * trust model already used for the rest of the public order flow. Only
 * returns a subset of the order, never restaurant data or other orders.
 */
export class TrackOrderController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      if (!id || !OBJECT_ID_REGEX.test(id)) {
        return reply.status(400).send(badRequest("Invalid order id"));
      }

      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          orderedAt: true,
          preparedAt: true,
          deliveredAt: true,
          finishedAt: true,
          canceledAt: true,
          totalValue: true,
          items: {
            select: {
              id: true,
              quantity: true,
              product: { select: { name: true, imageUrl: true } },
            },
          },
        },
      });

      if (!order) {
        return reply.status(404).send(notFound("Order not found"));
      }

      return reply.status(200).send({ statusCode: 200, response: order });
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to fetch order");
    }
  }
}

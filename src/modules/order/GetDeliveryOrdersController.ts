import { FastifyReply, FastifyRequest } from "fastify"
import { GetOrdersService } from "./GetOrdersService"

export class GetDeliveryOrdersController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { user } = request as any

    if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
      return reply.status(403).send({
        statusCode: 403,
        response: null,
        message: "Access denied"
      })
    }

    const service = new GetOrdersService()

    try {
      const orders = await service.execute({
        restaurantId: user.restaurantId,
        origin: "DELIVERY"
      })

      return reply.status(200).send({
        statusCode: 200,
        response: orders
      })
    } catch (error) {
      return reply.status(500).send({
        statusCode: 500,
        response: null,
        message: "Failed to fetch delivery orders"
      })
    }
  }
}

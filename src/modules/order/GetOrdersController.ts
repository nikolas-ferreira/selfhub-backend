import { FastifyReply, FastifyRequest } from "fastify"
import { GetOrdersService } from "./GetOrdersService"
import { OrderOrigin } from "./orderTypes"

type GetOrdersQuery = {
  productId?: string
  origin?: OrderOrigin
}

const validOrigins: OrderOrigin[] = ["DELIVERY", "PICKUP", "LOCAL"]
const objectIdRegex = /^[a-fA-F0-9]{24}$/

export class GetOrdersController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { user } = request as any

    if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
      return reply.status(403).send({
        statusCode: 403,
        response: null,
        message: "Access denied"
      })
    }

    const { productId, origin } = request.query as GetOrdersQuery

    if (!user.restaurantId || !objectIdRegex.test(user.restaurantId)) {
      return reply.status(401).send({
        statusCode: 401,
        response: null,
        message: "Invalid user context"
      })
    }

    if (productId && !objectIdRegex.test(productId)) {
      return reply.status(400).send({
        statusCode: 400,
        response: null,
        message: "Invalid productId filter"
      })
    }

    if (origin && !validOrigins.includes(origin)) {
      return reply.status(400).send({
        statusCode: 400,
        response: null,
        message: "Invalid origin filter"
      })
    }

    const service = new GetOrdersService()

    try {
      const orders = await service.execute({
        productId,
        origin,
        restaurantId: user.restaurantId
      })

      return reply.status(200).send({
        statusCode: 200,
        response: orders
      })
    } catch (error) {
      request.log.error({ error, productId, origin, restaurantId: user.restaurantId }, "Failed to fetch orders")

      return reply.status(500).send({
        statusCode: 500,
        response: null,
        message: "Failed to fetch orders"
      })
    }
  }
}

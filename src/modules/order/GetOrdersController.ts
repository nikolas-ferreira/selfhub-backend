import { FastifyReply, FastifyRequest } from "fastify"
import { GetOrdersService } from "./GetOrdersService"
import { OrderOrigin } from "./orderTypes"
import { respondInternalError } from "../../shared/utils/respondInternalError"

type GetOrdersQuery = {
  productId?: string
  origin?: OrderOrigin
}

const validOrigins: OrderOrigin[] = ["DELIVERY", "PICKUP", "LOCAL"]
const objectIdRegex = /^[a-fA-F0-9]{24}$/

/** `GET /orders` — lists orders for the caller's restaurant, restricted to ADMIN/MANAGER/CASHIER (cashier gets read-only access to check order status). */
export class GetOrdersController {
  /** Validates `productId`/`origin` query filters before delegating to {@link GetOrdersService}. */
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { user } = request as any

    if (!user || !["ADMIN", "MANAGER", "CASHIER"].includes(user.role)) {
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
      return respondInternalError(request, reply, error, "Failed to fetch orders")
    }
  }
}

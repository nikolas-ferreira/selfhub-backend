import { FastifyRequest, FastifyReply } from "fastify"
import { GetOrdersService } from "./GetOrdersService"

type GetOrdersQuery = {
  productId?: string
}

type AuthenticatedRequest = FastifyRequest<{
  Querystring: GetOrdersQuery
}> & {
  user: {
    id: string
    role: "ADMIN" | "MANAGER" | "WAITER"
    restaurantId: string
  }
}

export class GetOrdersController {
  async handle(request: AuthenticatedRequest, reply: FastifyReply) {
    const { role, restaurantId } = request.user

    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.status(403).send({
        statusCode: 403,
        response: null,
        message: "Unauthorized access"
      })
    }

    const { productId } = request.query

    const service = new GetOrdersService()
    const orders = await service.execute({ restaurantId, productId })

    return reply.status(200).send({
      statusCode: 200,
      response: orders
    })
  }
}

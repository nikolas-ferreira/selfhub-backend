import { FastifyReply, FastifyRequest } from "fastify"
import { GetProductInsightsService } from "./GetProductInsightsService"

export class GetProductInsightsController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { user } = request as any

    if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
      return reply.status(403).send({
        statusCode: 403,
        response: null,
        message: "Access denied",
      })
    }

    const service = new GetProductInsightsService()

    try {
      const insights = await service.execute({
        restaurantId: user.restaurantId,
      })

      return reply.status(200).send({
        statusCode: 200,
        response: insights,
      })
    } catch (error) {
      console.error("GetProductInsightsController error:", error)
      return reply.status(500).send({
        statusCode: 500,
        response: null,
        message: "Failed to generate insights",
      })
    }
  }
}


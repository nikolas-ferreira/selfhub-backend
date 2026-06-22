import { FastifyReply, FastifyRequest } from "fastify"
import { GetProductInsightsService } from "./GetProductInsightsService"
import { respondInternalError } from "../../shared/utils/respondInternalError"

/** `GET /insights/products` — AI-generated per-product analytics for the caller's restaurant. Restricted to ADMIN/MANAGER. */
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
      return respondInternalError(request, reply, error, "Failed to generate insights")
    }
  }
}


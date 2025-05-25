import { FastifyRequest, FastifyReply } from "fastify"
import { GetInsightsService } from "./GetInsightsService"
import { successResponse, badRequest, internalError } from "../../shared/utils/httpResponse"

export class AiController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user

    if (!user?.restaurantId || !["ADMIN", "MANAGER"].includes(user.role)) {
      return reply.status(403).send(badRequest("Acesso não autorizado"))
    }

    try {
      const service = new GetInsightsService()
      const insights = await service.execute(user.restaurantId)

      return reply.status(200).send(successResponse(insights))
    } catch (error) {
      console.error(error)
      return reply.status(500).send(internalError("Erro ao gerar insights"))
    }
  }
}

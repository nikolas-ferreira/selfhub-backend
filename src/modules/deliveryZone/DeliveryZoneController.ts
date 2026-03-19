import { FastifyReply, FastifyRequest } from "fastify"
import { DeliveryZoneService } from "./DeliveryZoneService"

interface LoggedUser {
  id: string
  role: "WAITER" | "MANAGER" | "ADMIN"
  restaurantId: string
}

export class DeliveryZoneController {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser

    if (!user) {
      return reply.status(401).send({ statusCode: 401, response: null, message: "Unauthorized" })
    }

    const { name, deliveryFee, estimatedTime } = request.body as {
      name: string
      deliveryFee: number
      estimatedTime?: number
    }

    const service = new DeliveryZoneService()
    const result = await service.create({ name, deliveryFee, estimatedTime, loggedUser: user })

    return reply.status(result.statusCode).send(result)
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser

    if (!user) {
      return reply.status(401).send({ statusCode: 401, response: null, message: "Unauthorized" })
    }

    const service = new DeliveryZoneService()
    const result = await service.list(user)

    return reply.status(result.statusCode).send(result)
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser

    if (!user) {
      return reply.status(401).send({ statusCode: 401, response: null, message: "Unauthorized" })
    }

    const { id } = request.params as { id: string }
    const { name, deliveryFee, estimatedTime } = request.body as {
      name?: string
      deliveryFee?: number
      estimatedTime?: number | null
    }

    const service = new DeliveryZoneService()
    const result = await service.update({ id, name, deliveryFee, estimatedTime, loggedUser: user })

    return reply.status(result.statusCode).send(result)
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser

    if (!user) {
      return reply.status(401).send({ statusCode: 401, response: null, message: "Unauthorized" })
    }

    const { id } = request.params as { id: string }

    const service = new DeliveryZoneService()
    const result = await service.remove({ id, loggedUser: user })

    return reply.status(result.statusCode).send(result)
  }
}

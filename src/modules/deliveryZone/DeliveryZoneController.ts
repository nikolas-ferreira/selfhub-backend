import { FastifyReply, FastifyRequest } from "fastify"
import { DeliveryZoneService } from "./DeliveryZoneService"

interface LoggedUser {
  id: string
  role: "WAITER" | "MANAGER" | "ADMIN"
  restaurantId: string
}

/** HTTP layer for `/delivery-zones` CRUD. Role checks (MANAGER/ADMIN) happen in {@link DeliveryZoneService}. */
export class DeliveryZoneController {
  /** `POST /delivery-zones` */
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

  /**
   * `GET /delivery-zones` — any authenticated user in the restaurant gets
   * the full list (incl. inactive). An anonymous caller (digital menu
   * checkout) must pass `restaurantId` and only gets `isActive: true` zones
   * — see {@link DeliveryZoneService.listPublic} and
   * docs/digital-menu-feature.md §6.
   */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser | undefined
    const service = new DeliveryZoneService()

    if (user) {
      const result = await service.list(user)
      return reply.status(result.statusCode).send(result)
    }

    const { restaurantId } = request.query as { restaurantId?: string }

    if (!restaurantId) {
      return reply.status(400).send({ statusCode: 400, response: null, message: "'restaurantId' query param is required" })
    }

    const result = await service.listPublic({ restaurantId })
    return reply.status(result.statusCode).send(result)
  }

  /** `PUT /delivery-zones/:id` */
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

  /** `DELETE /delivery-zones/:id` — see {@link DeliveryZoneService.remove} for delete-vs-deactivate semantics. */
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

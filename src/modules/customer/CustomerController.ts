import { FastifyReply, FastifyRequest } from "fastify"
import { CustomerService } from "./CustomerService"

interface LoggedUser {
  id: string
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER"
  restaurantId: string
}

/** HTTP layer for `/customers` (read/edit). Role checks (MANAGER/ADMIN) happen in {@link CustomerService}. */
export class CustomerController {
  /** `GET /customers?search=` */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser

    if (!user) {
      return reply.status(401).send({ statusCode: 401, response: null, message: "Unauthorized" })
    }

    const { search } = request.query as { search?: string }

    const service = new CustomerService()
    const result = await service.list({ search, loggedUser: user })

    return reply.status(result.statusCode).send(result)
  }

  /** `GET /customers/:id` */
  async getById(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser

    if (!user) {
      return reply.status(401).send({ statusCode: 401, response: null, message: "Unauthorized" })
    }

    const { id } = request.params as { id: string }

    const service = new CustomerService()
    const result = await service.getById({ id, loggedUser: user })

    return reply.status(result.statusCode).send(result)
  }

  /** `PUT /customers/:id` */
  async update(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser

    if (!user) {
      return reply.status(401).send({ statusCode: 401, response: null, message: "Unauthorized" })
    }

    const { id } = request.params as { id: string }
    const { name, phone, cpf } = request.body as { name?: string; phone?: string; cpf?: string }

    const service = new CustomerService()
    const result = await service.update({ id, name, phone, cpf, loggedUser: user })

    return reply.status(result.statusCode).send(result)
  }
}

import { FastifyReply, FastifyRequest } from "fastify";
import { StaffService } from "./StaffService";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

/** HTTP layer for `/staff` CRUD (the admin "Equipe" tab). Role/ownership checks happen in {@link StaffService}. */
export class StaffController {
  /** `GET /staff?restaurantId=` */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;

    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.query as { restaurantId?: string };

    if (!restaurantId) {
      return reply.status(400).send(badRequest("'restaurantId' query param is required"));
    }

    const service = new StaffService();
    const result = await service.list({ restaurantId, loggedUser: user });

    return reply.status(result.statusCode).send(result);
  }

  /** `POST /staff` */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;

    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { name, email, password, role } = request.body as {
      name: string;
      email: string;
      password: string;
      role: "WAITER" | "MANAGER" | "ADMIN";
    };

    const service = new StaffService();
    const result = await service.create({ name, email, password, role, loggedUser: user });

    return reply.status(result.statusCode).send(result);
  }

  /** `PUT /staff/:id` */
  async update(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;

    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { id } = request.params as { id: string };
    const { name, email, role, isActive } = request.body as {
      name?: string;
      email?: string;
      role?: "WAITER" | "MANAGER" | "ADMIN";
      isActive?: boolean;
    };

    const service = new StaffService();
    const result = await service.update({ id, name, email, role, isActive, loggedUser: user });

    return reply.status(result.statusCode).send(result);
  }

  /** `DELETE /staff/:id` — soft-delete; returns 204 with no body on success. */
  async remove(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;

    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { id } = request.params as { id: string };

    const service = new StaffService();
    const result = await service.remove({ id, loggedUser: user });

    return reply.status(result.statusCode).send(result);
  }
}

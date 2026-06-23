import { FastifyReply, FastifyRequest } from "fastify";
import { TableLayoutService } from "./TableLayoutService";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/restaurants/:restaurantId/table-layout`. Role checks happen in {@link TableLayoutService}. */
export class TableLayoutController {
  /** `GET /restaurants/:restaurantId/table-layout` */
  async get(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;

    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };

    if (restaurantId !== user.restaurantId) {
      return reply.status(401).send(unauthorized("You don't have access to this restaurant"));
    }

    const service = new TableLayoutService();
    const result = await service.getLayout(user);

    return reply.status(result.statusCode).send(result);
  }

  /** `PUT /restaurants/:restaurantId/table-layout` */
  async save(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;

    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };

    if (restaurantId !== user.restaurantId) {
      return reply.status(401).send(unauthorized("You don't have access to this restaurant"));
    }

    const { tables, walls } = request.body as { tables?: unknown; walls?: unknown };

    if (!Array.isArray(tables) || !Array.isArray(walls)) {
      return reply.status(400).send(badRequest("'tables' and 'walls' must be arrays"));
    }

    const service = new TableLayoutService();
    const result = await service.saveLayout({ tables, walls, loggedUser: user });

    return reply.status(result.statusCode).send(result);
  }

  /** `PATCH /restaurants/:restaurantId/tables/:tableId/status` */
  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;

    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId, tableId } = request.params as { restaurantId: string; tableId: string };

    if (restaurantId !== user.restaurantId) {
      return reply.status(401).send(unauthorized("You don't have access to this restaurant"));
    }

    const { status } = request.body as { status?: unknown };

    if (typeof status !== "string") {
      return reply.status(400).send(badRequest("'status' is required"));
    }

    const service = new TableLayoutService();
    const result = await service.updateStatus({ tableId, status, loggedUser: user });

    return reply.status(result.statusCode).send(result);
  }
}

import { FastifyReply, FastifyRequest } from "fastify";
import { ComandaService } from "./ComandaService";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/comandas` and `/tables/:tableNumber/comandas` — see comandas-backend-spec.md. */
export class ComandaController {
  private service = new ComandaService();

  /** `POST /comandas` */
  async open(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { number, tableNumber } = request.body as { number?: number; tableNumber?: number };

    if (number == null || tableNumber == null) {
      return reply.status(400).send(badRequest("'number' and 'tableNumber' are required"));
    }

    const result = await this.service.open({ number, tableNumber, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `GET /comandas/by-number/:number?restaurantId=` */
  async findOpenByNumber(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { number } = request.params as { number: string };
    const { restaurantId } = request.query as { restaurantId?: string };

    const parsedNumber = Number(number);
    if (!Number.isInteger(parsedNumber)) {
      return reply.status(400).send(badRequest("'number' must be an integer"));
    }

    if (!restaurantId) {
      return reply.status(400).send(badRequest("'restaurantId' query param is required"));
    }

    const result = await this.service.findOpenByNumber({ number: parsedNumber, restaurantId, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `GET /tables/:tableNumber/comandas?restaurantId=&status=` */
  async listByTable(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { tableNumber } = request.params as { tableNumber: string };
    const { restaurantId, status } = request.query as { restaurantId?: string; status?: string };

    const parsedTableNumber = Number(tableNumber);
    if (!Number.isInteger(parsedTableNumber)) {
      return reply.status(400).send(badRequest("'tableNumber' must be an integer"));
    }

    if (!restaurantId) {
      return reply.status(400).send(badRequest("'restaurantId' query param is required"));
    }

    if (status && status !== "OPEN" && status !== "CLOSED") {
      return reply.status(400).send(badRequest("'status' must be OPEN or CLOSED"));
    }

    const result = await this.service.listByTable({
      tableNumber: parsedTableNumber,
      restaurantId,
      status: status as "OPEN" | "CLOSED" | undefined,
      loggedUser: user,
    });
    return reply.status(result.statusCode).send(result);
  }
}

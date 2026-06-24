import { FastifyReply, FastifyRequest } from "fastify";
import { CashSessionService } from "./CashSessionService";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/cash-sessions`. Role/ownership checks happen in {@link CashSessionService}. */
export class CashSessionController {
  private service = new CashSessionService();

  /** `POST /cash-sessions` */
  async open(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { openingAmount } = request.body as { openingAmount?: number };
    if (typeof openingAmount !== "number") {
      return reply.status(400).send(badRequest("'openingAmount' is required"));
    }

    const result = await this.service.open({ openingAmount, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `GET /cash-sessions/current` */
  async getCurrent(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const result = await this.service.getCurrent({ loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `POST /cash-sessions/:id/close` */
  async close(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { closingAmount } = request.body as { closingAmount?: number };
    if (typeof closingAmount !== "number") {
      return reply.status(400).send(badRequest("'closingAmount' is required"));
    }

    const result = await this.service.close({ id, closingAmount, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `POST /cash-sessions/:id/movements` */
  async createMovement(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { type, amount, reason } = request.body as {
      type?: "WITHDRAWAL" | "SUPPLY";
      amount?: number;
      reason?: string;
    };

    if (!type || typeof amount !== "number" || !reason) {
      return reply.status(400).send(badRequest("'type', 'amount' and 'reason' are required"));
    }

    const result = await this.service.createMovement({
      cashSessionId: id,
      type,
      amount,
      reason,
      loggedUser: user,
    });
    return reply.status(result.statusCode).send(result);
  }

  /** `GET /cash-sessions` */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { restaurantId, cashierId, status, dateFrom, dateTo } = request.query as {
      restaurantId?: string;
      cashierId?: string;
      status?: "OPEN" | "CLOSED";
      dateFrom?: string;
      dateTo?: string;
    };

    if (!restaurantId) {
      return reply.status(400).send(badRequest("'restaurantId' query param is required"));
    }

    const result = await this.service.list({ restaurantId, cashierId, status, dateFrom, dateTo, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `GET /cash-sessions/:id` */
  async getDetail(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };

    const result = await this.service.getDetail({ id, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }
}

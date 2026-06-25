import { FastifyReply, FastifyRequest } from "fastify";
import { BillService } from "./BillService";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/restaurants/:restaurantId/comandas/:comandaNumber/bill` and `/bills/:id/*`. */
export class BillController {
  private service = new BillService();

  /** `GET /restaurants/:restaurantId/comandas/:comandaNumber/bill` */
  async getOrCreateBill(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { restaurantId, comandaNumber } = request.params as { restaurantId: string; comandaNumber: string };

    if (restaurantId !== user.restaurantId) {
      return reply.status(401).send(unauthorized("You don't have access to this restaurant"));
    }

    const parsedComandaNumber = Number(comandaNumber);
    if (!Number.isInteger(parsedComandaNumber)) {
      return reply.status(400).send(badRequest("'comandaNumber' must be an integer"));
    }

    const result = await this.service.getOrCreateBill({ restaurantId, comandaNumber: parsedComandaNumber, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `PATCH /bills/:id/discount` */
  async updateDiscount(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { discountPercent, discountAmount, approverId } = request.body as {
      discountPercent?: number;
      discountAmount?: number;
      approverId?: string;
    };

    const result = await this.service.updateDiscount({
      billId: id,
      discountPercent,
      discountAmount,
      approverId,
      loggedUser: user,
    });
    return reply.status(result.statusCode).send(result);
  }

  /** `PATCH /bills/:id/service-fee` */
  async updateServiceFee(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { serviceFeePercent } = request.body as { serviceFeePercent?: number | null };

    if (serviceFeePercent === undefined) {
      return reply.status(400).send(badRequest("'serviceFeePercent' is required"));
    }

    const result = await this.service.updateServiceFee({ billId: id, serviceFeePercent, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `POST /bills/:id/close` */
  async closeBill(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };

    const result = await this.service.closeBill({ billId: id, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }
}

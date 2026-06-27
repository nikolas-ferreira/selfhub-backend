import { FastifyReply, FastifyRequest } from "fastify";
import { CustomerDiscountService } from "./CustomerDiscountService";
import { unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/customers/:customerId/discounts` and `/customer-discounts/:id/cancel`. */
export class CustomerDiscountController {
  private service = new CustomerDiscountService();

  /** `POST /customers/:customerId/discounts` */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { customerId } = request.params as { customerId: string };
    const { discountPercent, discountAmount, reason } = request.body as {
      discountPercent?: number;
      discountAmount?: number;
      reason?: string;
    };

    const result = await this.service.create({ customerId, discountPercent, discountAmount, reason, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `POST /customer-discounts/:id/cancel` */
  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };

    const result = await this.service.cancel({ id, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }
}

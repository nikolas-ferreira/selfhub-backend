import { FastifyReply, FastifyRequest } from "fastify";
import { PaymentService } from "./PaymentService";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/bills/:id/payments*` and `/payments/:id`. */
export class PaymentController {
  private service = new PaymentService();

  /** `POST /bills/:id/payments` */
  async registerPayment(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { method, amount } = request.body as { method?: "CASH" | "CARD"; amount?: number };

    if (!method || typeof amount !== "number") {
      return reply.status(400).send(badRequest("'method' and 'amount' are required"));
    }

    const result = await this.service.registerPayment({ billId: id, method, amount, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `POST /bills/:id/payments/pix` */
  async createPixCharge(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { amount } = request.body as { amount?: number };

    if (typeof amount !== "number") {
      return reply.status(400).send(badRequest("'amount' is required"));
    }

    const result = await this.service.createPixCharge({ billId: id, amount, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `GET /payments/:id` */
  async getPayment(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };

    const result = await this.service.getPayment({ id, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }
}

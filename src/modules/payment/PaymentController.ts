import { FastifyReply, FastifyRequest } from "fastify";
import { PaymentService } from "./PaymentService";
import { badRequest, unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** Reads the `Idempotency-Key` header (Fastify lowercases header names). Undefined when absent. */
function idempotencyKeyOf(request: FastifyRequest): string | undefined {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.trim() ? value.trim() : undefined;
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
    const idempotencyKey = idempotencyKeyOf(request);

    if (!method || typeof amount !== "number") {
      return reply.status(400).send(badRequest("'method' and 'amount' are required"));
    }

    const result = await this.service.registerPayment({ billId: id, method, amount, idempotencyKey, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `POST /bills/:id/payments/pix` */
  async createPixCharge(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { amount } = request.body as { amount?: number };
    const idempotencyKey = idempotencyKeyOf(request);

    if (typeof amount !== "number") {
      return reply.status(400).send(badRequest("'amount' is required"));
    }

    const result = await this.service.createPixCharge({ billId: id, amount, idempotencyKey, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }

  /** `POST /payments/:id/refund` — estorno (MANAGER/ADMIN), motivo obrigatório. */
  async refundPayment(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason?: string };

    if (!reason || !reason.trim()) {
      return reply.status(400).send(badRequest("'reason' is required"));
    }

    const result = await this.service.refundPayment({ paymentId: id, reason, loggedUser: user });
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

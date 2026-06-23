import { FastifyReply, FastifyRequest } from "fastify";
import { FiscalDocumentService } from "./FiscalDocumentService";
import { unauthorized } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/bills/:id/fiscal-document`. */
export class FiscalDocumentController {
  private service = new FiscalDocumentService();

  /** `POST /bills/:id/fiscal-document` */
  async issue(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };
    const { customerEmail, customerPhone, customerCpf } = request.body as {
      customerEmail?: string;
      customerPhone?: string;
      customerCpf?: string;
    };

    const result = await this.service.issue({
      billId: id,
      customerEmail,
      customerPhone,
      customerCpf,
      loggedUser: user,
    });
    return reply.status(result.statusCode).send(result);
  }

  /** `GET /bills/:id/fiscal-document` */
  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) return reply.status(401).send(unauthorized());

    const { id } = request.params as { id: string };

    const result = await this.service.getStatus({ billId: id, loggedUser: user });
    return reply.status(result.statusCode).send(result);
  }
}

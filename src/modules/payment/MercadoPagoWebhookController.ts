import { FastifyReply, FastifyRequest } from "fastify";
import prisma from "../../shared/prisma";
import * as mercadoPago from "./mercadoPago";

/**
 * `POST /webhooks/mercadopago` — called only by Mercado Pago, never by the
 * front-end (see caixa-backend-spec.md §"Regra de segurança mais
 * importante" — this is the endpoint that doc explicitly excludes from the
 * front's contract). Confirms/fails the matching `Payment` by `pixTxId`.
 *
 * Always replies 200 (even when there's nothing to do) so Mercado Pago
 * doesn't keep retrying — errors are logged, not surfaced as a failure
 * status, since this isn't a request we can ask the caller to "fix and
 * resend" in the usual sense.
 */
export class MercadoPagoWebhookController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as { data?: { id?: string }; type?: string } | undefined;
      const query = request.query as { id?: string; "data.id"?: string; topic?: string; type?: string };

      const paymentId = body?.data?.id || query["data.id"] || query.id;
      const topic = body?.type || query.topic || query.type;

      if (!paymentId || (topic && topic !== "payment")) {
        return reply.status(200).send({ received: true });
      }

      const payment = await prisma.payment.findFirst({ where: { pixTxId: String(paymentId) } });
      if (!payment) {
        return reply.status(200).send({ received: true });
      }

      // Already settled — webhook delivery is at-least-once, this keeps it idempotent.
      if (payment.status !== "PENDING") {
        return reply.status(200).send({ received: true });
      }

      const mpPayment = await mercadoPago.getPayment(String(paymentId));
      const status = mercadoPago.mapMercadoPagoStatus(mpPayment.status);

      if (status === "PENDING") {
        return reply.status(200).send({ received: true });
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          pixPaidAt: status === "CONFIRMED" ? new Date() : null,
        },
      });

      return reply.status(200).send({ received: true });
    } catch (err) {
      request.log.error({ err }, "Failed to process Mercado Pago webhook");
      return reply.status(200).send({ received: true });
    }
  }
}

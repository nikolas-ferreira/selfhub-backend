import { FastifyReply, FastifyRequest } from "fastify";

/**
 * `GET/POST /webhooks/whatsapp` — receives delivery-status/inbound-message events from Meta.
 * Optional for v1: sending notifications doesn't depend on this being configured at all, it only
 * matters once a restaurant wants delivery/read receipts or inbound replies handled. For now it
 * just verifies the handshake and logs incoming events — no per-restaurant routing or persistence
 * yet (see docs/whatsapp-notifications-feature.md for the deferred per-restaurant signature
 * validation via `RestaurantWhatsAppConfig.appSecret`).
 */
export class WhatsAppWebhookController {
  /** Meta's one-time subscription handshake: echo back `hub.challenge` if the verify token matches. */
  async verify(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as Record<string, string>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send("Forbidden");
  }

  /** Always responds 200 — Meta retries aggressively on non-2xx, and there's nothing actionable to reject yet. */
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      request.log.info({ body: request.body }, "Received WhatsApp webhook event");
    } catch (err) {
      request.log.error({ err }, "Failed to process WhatsApp webhook event");
    }

    return reply.status(200).send({ received: true });
  }
}

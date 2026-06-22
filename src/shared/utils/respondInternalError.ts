import { FastifyReply, FastifyRequest } from "fastify";
import { internalError } from "./httpResponse";

/**
 * Logs an unexpected (500) error with full detail — stack trace, route,
 * method, and the authenticated user/restaurant when available — keyed by
 * `request.id`, then sends the client a generic message containing that same
 * id as `errorId`.
 *
 * Use this from a controller's `catch` block instead of `console.error(...)`
 * followed by `reply.send(internalError(...))`. It keeps the two in sync: the
 * id a client reports always matches a single log line with the real cause.
 *
 * Do not use this for operational errors (400/401/403/404) — those are safe
 * to return with their original `message` and don't need log correlation.
 */
export function respondInternalError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  publicMessage = "Internal Server Error"
) {
  request.log.error(
    {
      err: error,
      errorId: request.id,
      method: request.method,
      url: request.url,
      userId: request.user?.id,
      restaurantId: request.user?.restaurantId,
    },
    publicMessage
  );

  return reply.status(500).send(internalError(publicMessage, request.id));
}

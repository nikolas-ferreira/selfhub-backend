import { FastifyReply, FastifyRequest } from "fastify";

/**
 * Global Fastify error handler (registered via `app.setErrorHandler`).
 *
 * Errors with `statusCode < 500` are treated as operational (validation,
 * auth, not-found, etc.) and their `message` is safe to return verbatim.
 * Anything else is logged server-side (full error + stack + request
 * context) and replaced with a generic message plus an `errorId` —
 * `request.id` — so internal exception details never reach the client, but
 * a developer can grep the logs for that exact id to find the stack trace.
 *
 * Most controllers in this codebase catch their own errors instead of
 * letting them reach this handler (see `src/shared/utils/respondInternalError.ts`
 * for the helper they should use to get the same behavior). This handler is
 * the fallback for anything that escapes those try/catch blocks.
 */
export function errorHandler(error: any, request: FastifyRequest, reply: FastifyReply) {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    request.log.error(
      {
        err: error,
        errorId: request.id,
        method: request.method,
        url: request.url,
        userId: request.user?.id,
        restaurantId: request.user?.restaurantId,
      },
      error.message || "Unhandled error"
    );
    reply.status(statusCode).send({
      statusCode,
      response: null,
      message: "Internal Server Error",
      errorId: request.id,
    });
    return;
  }

  reply.status(statusCode).send({
    statusCode,
    response: null,
    message: error.message || "Bad Request",
  });
}
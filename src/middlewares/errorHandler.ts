import { FastifyReply, FastifyRequest } from "fastify";

export function errorHandler(error: any, request: FastifyRequest, reply: FastifyReply) {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  reply.status(statusCode).send({
    statusCode,
    response: null,
    message,
  });
}
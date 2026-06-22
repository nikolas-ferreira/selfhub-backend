import { FastifyReply, FastifyRequest } from "fastify";
import prismaClient from "../../shared/prisma";
import { badRequest, notFound, successResponse } from "../../shared/utils/httpResponse";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface GetRestaurantParams {
  Params: {
    cnpj: string;
  };
}

/** `GET /restaurant/:cnpj` — public lookup, used e.g. to resolve a restaurant from a QR code. */
export class GetRestaurantController {
  /** Looks up a restaurant by (sanitized) CNPJ. No Prisma-querying layer below this — talks to the DB directly. */
  async handle(request: FastifyRequest<GetRestaurantParams>, reply: FastifyReply) {
    try {
      const { cnpj } = request.params;

      if (!cnpj) {
        return reply.status(400).send(badRequest("CNPJ is required"));
      }

      const sanitizedCnpj = cnpj.replace(/\D/g, "");

      if (sanitizedCnpj.length !== 14) {
        return reply.status(400).send(badRequest("CNPJ must have 14 digits"));
      }

      const restaurant = await prismaClient.restaurant.findUnique({
        where: { cnpj: sanitizedCnpj },
      });

      if (!restaurant) {
        return reply.status(404).send(notFound("Restaurant not found"));
      }

      return reply.send(successResponse(restaurant));
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to fetch restaurant");
    }
  }
}


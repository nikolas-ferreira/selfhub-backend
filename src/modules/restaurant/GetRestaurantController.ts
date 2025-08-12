import { FastifyReply, FastifyRequest } from "fastify";
import prismaClient from "../../shared/prisma";
import { badRequest, internalError, notFound, successResponse } from "../../shared/utils/httpResponse";

interface GetRestaurantParams {
  Params: {
    cnpj: string;
  };
}

export class GetRestaurantController {
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
      console.error(err);
      return reply
        .status(500)
        .send(internalError("Failed to fetch restaurant"));
    }
  }
}


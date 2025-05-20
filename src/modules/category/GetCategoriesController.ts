import { FastifyRequest, FastifyReply } from "fastify";
import prismaClient from "../../shared/prisma";
import { badRequest, internalError, successResponse } from "../../shared/utils/httpResponse";

interface CategoriesQuery {
  Querystring: {
    restaurantId: string;
  };
}

export class GetCategoriesController {
  async handle(request: FastifyRequest<CategoriesQuery>, reply: FastifyReply) {
    try {
      const { restaurantId } = request.query;

      if (!restaurantId) {
        return reply.status(400).send(badRequest("restaurantId is required"));
      }

      const categories = await prismaClient.category.findMany({
        where: {
          restaurantId,
        },
      });

      return reply.send(successResponse(categories));
    } catch (err) {
      console.error(err);
      return reply.status(500).send(internalError("Failed to fetch categories"));
    }
  }
}

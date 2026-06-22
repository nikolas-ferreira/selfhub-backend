import { FastifyRequest, FastifyReply } from "fastify";
import prismaClient from "../../shared/prisma";
import { badRequest, successResponse } from "../../shared/utils/httpResponse";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface CategoriesQuery {
  Querystring: {
    restaurantId: string;
  };
}

/**
 * `GET /categories` — public catalog listing, filtered by `restaurantId` query param.
 * Queries Prisma directly (no service layer); see RFC for the planned `GetCategoriesService` extraction.
 */
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
      return respondInternalError(request, reply, err, "Failed to fetch categories");
    }
  }
}

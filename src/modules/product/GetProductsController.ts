import { FastifyRequest, FastifyReply } from "fastify";
import prismaClient from "../../shared/prisma";
import { badRequest, successResponse } from "../../shared/utils/httpResponse";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface ProductsQuery {
  Querystring: {
    categoryId?: string;
    restaurantId?: string;
  };
}

/**
 * `GET /products` — public catalog listing, filtered by `categoryId` or `restaurantId`.
 * Queries Prisma directly (no service layer); see RFC for the planned `GetProductsService` extraction.
 */
export class GetProductsController {
  async handle(request: FastifyRequest<ProductsQuery>, reply: FastifyReply) {
    try {
      const { categoryId, restaurantId } = request.query;

      if (!categoryId && !restaurantId) {
        return reply
          .status(400)
          .send(badRequest("Either categoryId or restaurantId is required"));
      }

      const whereClause = categoryId
        ? { categoryId }
        : {
            category: {
              restaurantId,
            },
          };

      const products = await prismaClient.product.findMany({
        where: whereClause,
        include: {
          customizationGroups: {
            include: {
              options: true,
            },
          },
        },
      });

      return reply.send(successResponse(products));
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to fetch products");
    }
  }
}

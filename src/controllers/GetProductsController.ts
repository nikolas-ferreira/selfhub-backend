import { FastifyRequest, FastifyReply } from "fastify";
import prismaClient from "../prisma";
import { badRequest, internalError, successResponse } from "../utils/httpResponse";

interface ProductsQuery {
  Querystring: {
    categoryId?: string;
    restaurantId?: string;
  };
}

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
          category: false,
        },
      });

      return reply.send(successResponse(products));
    } catch (err) {
      console.error(err);
      return reply.status(500).send(internalError("Failed to fetch products"));
    }
  }
}

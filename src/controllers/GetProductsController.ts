import { FastifyRequest, FastifyReply } from "fastify";
import prismaClient from "../prisma";
import { badRequest, internalError, successResponse } from "../utils/httpResponse";

interface ProductsQuery {
  Querystring: {
    categoryId: string;
  };
}

export class GetProductsController {
  async handle(request: FastifyRequest<ProductsQuery>, reply: FastifyReply) {
    try {
      const { categoryId } = request.query;

      if (!categoryId) {
        return reply.status(400).send(badRequest("categoryId is required"));
      }

      const products = await prismaClient.product.findMany({
        where: { categoryId },
      });

      return reply.send(successResponse(products));
    } catch (err) {
      console.error(err);
      return reply.status(500).send(internalError("Failed to fetch products"));
    }
  }
}


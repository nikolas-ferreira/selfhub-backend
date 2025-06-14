import { FastifyRequest, FastifyReply } from "fastify";
import { CreateProductService } from "./CreateProductService";
import { internalError } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

export class CreateProductController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const {
        name,
        price,
        imageUrl,
        description,
        categoryId,
        customizationGroups,
      } = request.body as {
        name: string;
        price: number;
        imageUrl: string;
        description: string;
        categoryId: string;
        customizationGroups?: {
          name: string;
          min: number;
          max: number;
          options: {
            name: string;
            price: number;
          }[];
        }[];
      };

      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          response: null,
          message: "Unauthorized: Missing user info",
        });
      }

      const loggedUser = request.user as LoggedUser;

      const service = new CreateProductService();
      const result = await service.execute({
        name,
        price,
        imageUrl,
        description,
        categoryId,
        loggedUser,
        customizationGroups,
      });

      return reply.status(result.statusCode).send(result);
    } catch (err: any) {
      console.error(err);
      return reply.status(500).send(internalError("Failed to create product"));
    }
  }
}

import { FastifyRequest, FastifyReply } from "fastify";
import { EditProductService } from "./EditProductService";
import { internalError } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

export class EditProductController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const {
        name,
        price,
        imageUrl,
        description,
        categoryId,
        customizationGroups,
      } = request.body as {
        name?: string;
        price?: number;
        imageUrl?: string;
        description?: string;
        categoryId?: string;
        customizationGroups?: {
          name: string;
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

      const service = new EditProductService();
      const result = await service.execute({
        id,
        name,
        price,
        imageUrl,
        description,
        categoryId,
        customizationGroups,
        loggedUser,
      });

      return reply.status(result.statusCode).send(result);
    } catch (err) {
      console.error(err);
      return reply.status(500).send(internalError("Failed to update product"));
    }
  }
}

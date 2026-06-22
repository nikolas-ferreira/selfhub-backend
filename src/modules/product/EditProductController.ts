import { FastifyRequest, FastifyReply } from "fastify";
import { EditProductService } from "./EditProductService";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

/** HTTP layer for `PUT /products/:id`. */
export class EditProductController {
  /** Requires an authenticated user; role/ownership checks happen in {@link EditProductService}. */
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
      return respondInternalError(request, reply, err, "Failed to update product");
    }
  }
}

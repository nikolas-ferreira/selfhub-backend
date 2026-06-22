import { FastifyRequest, FastifyReply } from "fastify";
import { EditCategoryService } from "./EditCategoryService";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

/** HTTP layer for `PUT /categories/:id`. */
export class EditCategoryController {
  /** Requires an authenticated user; role/ownership checks happen in {@link EditCategoryService}. */
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { name, iconUrl } = request.body as { name?: string; iconUrl?: string };

      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          response: null,
          message: "Unauthorized: Missing user info",
        });
      }

      const loggedUser = request.user as LoggedUser;

      const service = new EditCategoryService();
      const result = await service.execute({ id, name, iconUrl, loggedUser });

      return reply.status(result.statusCode).send(result);
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to update category");
    }
  }
}

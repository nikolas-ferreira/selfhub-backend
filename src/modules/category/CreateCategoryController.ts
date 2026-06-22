import { FastifyRequest, FastifyReply } from "fastify";
import { CreateCategoryService } from "./CreateCategoryService";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

/** HTTP layer for `POST /categories`. */
export class CreateCategoryController {
  /** Requires an authenticated user; role check (MANAGER/ADMIN) happens in {@link CreateCategoryService}. */
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, iconUrl } = request.body as { name: string; iconUrl: string };

      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          response: null,
          message: "Unauthorized: Missing user info",
        });
      }

      const loggedUser = request.user as LoggedUser;

      const service = new CreateCategoryService();
      const result = await service.execute({ name, iconUrl, loggedUser });

      return reply.status(result.statusCode).send(result);
    } catch (err) {
      return respondInternalError(request, reply, err, "Failed to create category");
    }
  }
}

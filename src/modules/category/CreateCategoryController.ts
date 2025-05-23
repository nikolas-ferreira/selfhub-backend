import { FastifyRequest, FastifyReply } from "fastify";
import { CreateCategoryService } from "./CreateCategoryService";
import { internalError } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

export class CreateCategoryController {
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
    } catch (err: any) {
      console.error(err);
      return reply.status(500).send(internalError("Failed to create category"));
    }
  }
}

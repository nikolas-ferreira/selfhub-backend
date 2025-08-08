import { FastifyRequest, FastifyReply } from "fastify";
import { CreateRestautantService } from "./CreateRestaurantService";
import { errorResponse, internalError, badRequest } from "../../shared/utils/httpResponse";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

class CreateRestaurantController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name } = request.body as { name: string };

      const user = request.user as LoggedUser | undefined;

      if (!user || user.role !== "ADMIN") {
        return reply
          .status(403)
          .send(errorResponse(403, "Only admins can create restaurants"));
      }

      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send(badRequest("Name is required"));
      }

      const restaurantService = new CreateRestautantService();
      const restaurant = await restaurantService.execute({ name });

      return reply.status(201).send(restaurant);
    } catch (error: any) {
      console.error(error);
      return reply
        .status(500)
        .send(internalError("Failed to create restaurant"));
    }
  }
}

export { CreateRestaurantController };
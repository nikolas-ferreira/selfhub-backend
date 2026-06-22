import { FastifyRequest, FastifyReply } from "fastify";
import { CreateRestautantService } from "./CreateRestaurantService";
import { errorResponse, badRequest, successResponse } from "../../shared/utils/httpResponse";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN";
  restaurantId: string;
}

/** HTTP layer for `POST /restaurant`. Requires an authenticated ADMIN. */
class CreateRestaurantController {
  /** Validates input, enforces the ADMIN-only rule, then delegates to {@link CreateRestautantService}. */
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, cnpj } = request.body as { name: string; cnpj: string };

      const user = request.user as LoggedUser | undefined;

      if (!user || user.role !== "ADMIN") {
        return reply
          .status(403)
          .send(errorResponse(403, "Only admins can create restaurants"));
      }

      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send(badRequest("Name is required"));
      }

      if (!cnpj || typeof cnpj !== "string" || !cnpj.trim()) {
        return reply.status(400).send(badRequest("CNPJ is required"));
      }

      const sanitizedCnpj = cnpj.replace(/\D/g, "");

      if (sanitizedCnpj.length !== 14) {
        return reply.status(400).send(badRequest("CNPJ must have 14 digits"));
      }

      const restaurantService = new CreateRestautantService();
      const restaurant = await restaurantService.execute({ name, cnpj: sanitizedCnpj });

      return reply.status(201).send(successResponse(restaurant, "Restaurant created successfully"));
    } catch (error) {
      return respondInternalError(request, reply, error, "Failed to create restaurant");
    }
  }
}

export { CreateRestaurantController };
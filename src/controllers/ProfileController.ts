import { FastifyRequest, FastifyReply } from "fastify";
import { UpdateProfileService } from "../services/UpdateProfileService";
import { internalError } from "../utils/httpResponse";

interface UpdateProfileParams {
  id: string;
}

class ProfileController {
  async update(
    request: FastifyRequest<{ Params: UpdateProfileParams }>,
    reply: FastifyReply
  ) {
    try {
      const profileId = request.params.id;

      const { name, lastname, email, password, role } = request.body as {
        name?: string;
        lastname?: string;
        email?: string;
        password?: string;
        role?: "WAITER" | "MANAGER" | "ADMIN";
      };

      const loggedUser = request.user as {
        id: string;
        role: "WAITER" | "MANAGER" | "ADMIN";
        restaurantId: string;
      };

      const service = new UpdateProfileService();

      const result = await service.execute({
        profileId,
        name,
        lastname,
        email,
        password,
        role,
        loggedUser,
      });

      return reply.status(result.statusCode).send(result);
    } catch (error: any) {
      console.error(error);
      return reply.status(500).send(internalError(error?.message || "Failed to update profile"));
    }
  }
}

export { ProfileController };

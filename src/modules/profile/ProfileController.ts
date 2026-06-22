import { FastifyRequest, FastifyReply } from "fastify";
import { UpdateProfileService } from "./UpdateProfileService";
import { respondInternalError } from "../../shared/utils/respondInternalError";

interface UpdateProfileParams {
  id: string;
}

/** HTTP layer for `/profile/:id`. */
class ProfileController {
  /** `PUT /profile/:id` — updates name/lastname/email/password/role of a profile. */
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
      return respondInternalError(request, reply, error, "Failed to update profile");
    }
  }
}

export { ProfileController };

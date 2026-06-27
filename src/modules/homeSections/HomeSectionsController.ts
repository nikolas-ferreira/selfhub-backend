import { FastifyReply, FastifyRequest } from "fastify";
import { HomeSectionsService } from "./HomeSectionsService";
import { unauthorized, badRequest } from "../../shared/utils/httpResponse";
import { HomeSectionInput } from "./homeSectionsTypes";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/restaurants/:restaurantId/home-sections`. Role/ownership checks happen in {@link HomeSectionsService}. */
export class HomeSectionsController {
  /** `GET /restaurants/:restaurantId/home-sections` */
  async get(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };

    const service = new HomeSectionsService();
    const result = await service.get(restaurantId, user);

    return reply.status(result.statusCode).send(result);
  }

  /** `PUT /restaurants/:restaurantId/home-sections` */
  async save(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };
    const { sections } = request.body as { sections?: unknown };

    if (!Array.isArray(sections)) {
      return reply.status(400).send(badRequest("'sections' must be an array"));
    }

    const service = new HomeSectionsService();
    const result = await service.save({
      restaurantId,
      sections: sections as HomeSectionInput[],
      loggedUser: user,
    });

    return reply.status(result.statusCode).send(result);
  }
}

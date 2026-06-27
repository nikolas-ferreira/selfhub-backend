import { FastifyReply, FastifyRequest } from "fastify";
import { BusinessHoursService } from "./BusinessHoursService";
import { unauthorized, badRequest } from "../../shared/utils/httpResponse";
import { BusinessHoursDayInput } from "../../shared/utils/businessHours";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

/** HTTP layer for `/restaurants/:restaurantId/business-hours`. Role/ownership checks happen in {@link BusinessHoursService}. */
export class BusinessHoursController {
  /** `GET /restaurants/:restaurantId/business-hours` */
  async get(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };

    const service = new BusinessHoursService();
    const result = await service.get(restaurantId, user);

    return reply.status(result.statusCode).send(result);
  }

  /** `PUT /restaurants/:restaurantId/business-hours` */
  async save(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };
    const { days } = request.body as { days?: unknown };

    if (!Array.isArray(days)) {
      return reply.status(400).send(badRequest("'days' must be an array"));
    }

    const service = new BusinessHoursService();
    const result = await service.save({ restaurantId, days: days as BusinessHoursDayInput[], loggedUser: user });

    return reply.status(result.statusCode).send(result);
  }
}

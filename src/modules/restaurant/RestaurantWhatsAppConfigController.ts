import { FastifyReply, FastifyRequest } from "fastify";
import { RestaurantWhatsAppConfigService } from "./RestaurantWhatsAppConfigService";
import { unauthorized, badRequest } from "../../shared/utils/httpResponse";
import { OrderStatus } from "../order/OrderStatus";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

interface SaveWhatsAppConfigBody {
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
  appSecret?: string;
  isActive?: boolean;
  notifyOnCreated?: boolean;
  notifyOnStatuses?: OrderStatus[];
}

/** HTTP layer for `/restaurants/:restaurantId/whatsapp-config`. Role/ownership checks happen in {@link RestaurantWhatsAppConfigService}. */
export class RestaurantWhatsAppConfigController {
  /** `GET /restaurants/:restaurantId/whatsapp-config` */
  async get(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };

    const service = new RestaurantWhatsAppConfigService();
    const result = await service.get(restaurantId, user);

    return reply.status(result.statusCode).send(result);
  }

  /** `PUT /restaurants/:restaurantId/whatsapp-config` */
  async save(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };
    const body = request.body as SaveWhatsAppConfigBody;

    if (!Array.isArray(body.notifyOnStatuses)) {
      return reply.status(400).send(badRequest("'notifyOnStatuses' must be an array"));
    }

    const service = new RestaurantWhatsAppConfigService();
    const result = await service.save({
      restaurantId,
      phoneNumberId: body.phoneNumberId || "",
      wabaId: body.wabaId || "",
      accessToken: body.accessToken,
      appSecret: body.appSecret,
      isActive: body.isActive ?? true,
      notifyOnCreated: body.notifyOnCreated ?? true,
      notifyOnStatuses: body.notifyOnStatuses,
      loggedUser: user,
    });

    return reply.status(result.statusCode).send(result);
  }

  /** `POST /restaurants/:restaurantId/whatsapp-config/test` */
  async test(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as LoggedUser;
    if (!user) {
      return reply.status(401).send(unauthorized());
    }

    const { restaurantId } = request.params as { restaurantId: string };

    const service = new RestaurantWhatsAppConfigService();
    const result = await service.testConnection(restaurantId, user);

    return reply.status(result.statusCode).send(result);
  }
}

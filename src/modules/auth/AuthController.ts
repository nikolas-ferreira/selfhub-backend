import { FastifyRequest, FastifyReply } from "fastify";
import { RegisterUserService } from "./RegisterUserService";
import { LoginUserService } from "./LoginUserService";
import { AssociateDeviceService } from "./AssociateDeviceService";
import { RefreshTokenService } from "./RefreshTokenService";
import { respondInternalError } from "../../shared/utils/respondInternalError";

/** HTTP layer for `/auth/*` routes. Delegates all business rules to the auth services. */
class AuthController {
  /** `POST /auth/register` — public signup, always provisions a WAITER. */
  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, lastname, email, password, restaurantId } = request.body as any;

      const service = new RegisterUserService();
      const result = await service.execute({ name, lastname, email, password, restaurantId });

      reply.status(result.statusCode).send(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        respondInternalError(request, reply, error, "Failed to register user");
        return;
      }
      reply.status(statusCode).send({ statusCode, response: null, message: error.message });
    }
  }

  /** `POST /auth/login` — exchanges credentials for an access/refresh token pair. */
  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { email, password } = request.body as any;

      const service = new LoginUserService();
      const result = await service.execute({ email, password });

      reply.status(result.statusCode).send(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        respondInternalError(request, reply, error, "Failed to log in");
        return;
      }
      reply.status(statusCode).send({ statusCode, response: null, message: error.message });
    }
  }

  /** `POST /auth/refresh-token` — exchanges a still-valid refresh token for a new access/refresh token pair. */
  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { refreshToken } = request.body as any;

      const service = new RefreshTokenService();
      const result = await service.execute({ refreshToken });

      reply.status(result.statusCode).send(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        respondInternalError(request, reply, error, "Failed to refresh token");
        return;
      }
      reply.status(statusCode).send({ statusCode, response: null, message: error.message });
    }
  }

  /** `POST /auth/associate-device` — pairs a kiosk device with a restaurant by CNPJ. */
  async associateDevice(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { macAddress, restaurantCnpj } = request.body as any;

      const service = new AssociateDeviceService();
      const result = await service.execute({ macAddress, restaurantCnpj });

      reply.status(result.statusCode).send(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        respondInternalError(request, reply, error, "Failed to associate device");
        return;
      }
      reply.status(statusCode).send({ statusCode, response: null, message: error.message });
    }
  }
}

export { AuthController };

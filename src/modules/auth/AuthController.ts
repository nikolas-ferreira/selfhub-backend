import { FastifyRequest, FastifyReply } from "fastify";
import { RegisterUserService } from "./RegisterUserService";
import { LoginUserService } from "./LoginUserService";
import { AssociateDeviceService } from "./AssociateDeviceService";

class AuthController {
  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, lastname, email, password, restaurantId, role } = request.body as any;

      const service = new RegisterUserService();
      const result = await service.execute({ name, lastname, email, password, restaurantId, role });

      reply.status(result.statusCode).send(result);
    } catch (error: any) {
      reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        response: null,
        message: error.message || "Internal Server Error",
      });
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { email, password } = request.body as any;

      const service = new LoginUserService();
      const result = await service.execute({ email, password });

      reply.status(result.statusCode).send(result);
    } catch (error: any) {
      reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        response: null,
        message: error.message || "Internal Server Error",
      });
    }
  }

  async associateDevice(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { macAddress, restaurantCnpj } = request.body as any;

      const service = new AssociateDeviceService();
      const result = await service.execute({ macAddress, restaurantCnpj });

      reply.status(result.statusCode).send(result);
    } catch (error: any) {
      reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        response: null,
        message: error.message || "Internal Server Error",
      });
    }
  }
}

export { AuthController };
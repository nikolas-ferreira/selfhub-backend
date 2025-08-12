import prismaClient from "../../shared/prisma";
import { successResponse } from "../../shared/utils/httpResponse";

interface AssociateDeviceProps {
  macAddress: string;
  restaurantCnpj: string;
}

export class AssociateDeviceService {
  async execute({ macAddress, restaurantCnpj }: AssociateDeviceProps) {
    const sanitizedCnpj = restaurantCnpj.replace(/\D/g, "");

    const restaurant = await prismaClient.restaurant.findUnique({
      where: { cnpj: sanitizedCnpj },
    });

    if (!restaurant) {
      throw { statusCode: 404, message: "Restaurant not found" };
    }

    const existing = await prismaClient.device.findUnique({
      where: { macAddress },
    });

    if (existing) {
      if (existing.restaurantId === restaurant.id) {
        return {
          statusCode: 201,
          response: null,
          message: "mac address already associated to this cnpj",
        };
      }

      throw {
        statusCode: 402,
        message: "mac address already associated to another cnpj",
      };
    }

    await prismaClient.device.create({
      data: {
        macAddress,
        restaurantId: restaurant.id,
      },
    });

    return successResponse(null, "Device associated successfully");
  }
}

import prismaClient from "../../shared/prisma";
import { successResponse } from "../../shared/utils/httpResponse";

interface AssociateDeviceProps {
  macAddress: string;
  restaurantCnpj: string;
}

/**
 * Pairs a physical device (kiosk/terminal) with a restaurant by CNPJ.
 * Public/unauthenticated endpoint — intended for first-boot device pairing.
 */
export class AssociateDeviceService {
  /**
   * Associates `macAddress` with the restaurant identified by `restaurantCnpj`.
   * Idempotent for the same restaurant; rejects re-pairing to a different one.
   *
   * @throws {{statusCode: 404}} if no restaurant matches the CNPJ.
   * @throws {{statusCode: 402}} if the MAC address is already bound to another restaurant.
   */
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
        return successResponse(
          restaurant,
          "mac address already associated to this cnpj"
        );
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

    return successResponse(restaurant, "Device associated successfully");
  }
}

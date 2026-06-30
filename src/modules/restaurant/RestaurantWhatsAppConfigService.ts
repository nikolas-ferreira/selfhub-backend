import prisma from "../../shared/prisma";
import { decryptToken, encryptToken } from "../../shared/crypto";
import { badRequest, forbidden, notFound } from "../../shared/utils/httpResponse";
import { verifyCredentials } from "../notification/WhatsAppClient";
import { OrderStatus } from "../order/OrderStatus";

interface LoggedUser {
  id: string;
  role: "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";
  restaurantId: string;
}

interface SaveWhatsAppConfigInput {
  restaurantId: string;
  phoneNumberId: string;
  wabaId: string;
  /** Optional on update — omitted/blank keeps the previously stored token (lets ADMIN tweak notification toggles without re-pasting it). Required the first time a restaurant configures WhatsApp. */
  accessToken?: string;
  appSecret?: string;
  isActive: boolean;
  notifyOnCreated: boolean;
  notifyOnStatuses: OrderStatus[];
  loggedUser: LoggedUser;
}

const ORDER_STATUS_VALUES = Object.values(OrderStatus);

/** Per-restaurant WhatsApp Business Cloud API credentials and notification toggles. Configuring is restricted to ADMIN — see plan §"Backend". */
export class RestaurantWhatsAppConfigService {
  async get(restaurantId: string, loggedUser: LoggedUser) {
    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    const config = await prisma.restaurantWhatsAppConfig.findUnique({ where: { restaurantId } });

    return { statusCode: 200, response: this.toPublicShape(config) };
  }

  async save(input: SaveWhatsAppConfigInput) {
    const { restaurantId, loggedUser } = input;

    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    if (loggedUser.role !== "ADMIN") {
      return forbidden("Only an ADMIN can configure WhatsApp notifications");
    }

    if (!input.phoneNumberId?.trim() || !input.wabaId?.trim()) {
      return badRequest("'phoneNumberId' and 'wabaId' are required");
    }

    for (const status of input.notifyOnStatuses) {
      if (!ORDER_STATUS_VALUES.includes(status)) {
        return badRequest(`Invalid order status '${status}'`);
      }
    }

    const existing = await prisma.restaurantWhatsAppConfig.findUnique({ where: { restaurantId } });

    if (!existing && !input.accessToken?.trim()) {
      return badRequest("'accessToken' is required when configuring WhatsApp for the first time");
    }

    const accessToken = input.accessToken?.trim() ? encryptToken(input.accessToken.trim()) : existing!.accessToken;

    const config = await prisma.restaurantWhatsAppConfig.upsert({
      where: { restaurantId },
      update: {
        phoneNumberId: input.phoneNumberId.trim(),
        wabaId: input.wabaId.trim(),
        accessToken,
        appSecret: input.appSecret?.trim() || existing?.appSecret || null,
        isActive: input.isActive,
        notifyOnCreated: input.notifyOnCreated,
        notifyOnStatuses: input.notifyOnStatuses,
      },
      create: {
        restaurantId,
        phoneNumberId: input.phoneNumberId.trim(),
        wabaId: input.wabaId.trim(),
        accessToken,
        appSecret: input.appSecret?.trim() || null,
        isActive: input.isActive,
        notifyOnCreated: input.notifyOnCreated,
        notifyOnStatuses: input.notifyOnStatuses,
      },
    });

    return { statusCode: 200, response: this.toPublicShape(config), message: "WhatsApp configuration saved" };
  }

  /** Sends a credential-check request to the Cloud API — doesn't send a message, just confirms `phoneNumberId`/`accessToken` are valid together. */
  async testConnection(restaurantId: string, loggedUser: LoggedUser) {
    if (restaurantId !== loggedUser.restaurantId) {
      return forbidden("You don't have access to this restaurant");
    }

    const config = await prisma.restaurantWhatsAppConfig.findUnique({ where: { restaurantId } });
    if (!config) {
      return notFound("WhatsApp isn't configured for this restaurant yet");
    }

    try {
      await verifyCredentials(config.phoneNumberId, decryptToken(config.accessToken));
      return { statusCode: 200, response: { connected: true }, message: "Conexão validada com sucesso" };
    } catch (err: any) {
      return { statusCode: 200, response: { connected: false }, message: err.message || "Falha ao validar a conexão" };
    }
  }

  /** Never exposes the encrypted/plaintext token — only whether one is set. */
  private toPublicShape(config: Awaited<ReturnType<typeof prisma.restaurantWhatsAppConfig.findUnique>>) {
    if (!config) return null;

    return {
      phoneNumberId: config.phoneNumberId,
      wabaId: config.wabaId,
      accessTokenConfigured: true,
      appSecretConfigured: !!config.appSecret,
      isActive: config.isActive,
      notifyOnCreated: config.notifyOnCreated,
      notifyOnStatuses: config.notifyOnStatuses,
      updatedAt: config.updatedAt,
    };
  }
}

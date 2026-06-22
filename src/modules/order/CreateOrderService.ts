import prisma from "../../shared/prisma";
import { Prisma } from "@prisma/client";
import { AddressInput, OrderOrigin } from "./orderTypes";

interface CustomizationOptionInput {
  name: string;
  additionalPrice: number;
  quantity: number;
}

interface CreateOrderItem {
  productId: string;
  quantity: number;
  observation: string;
  ratingStar: number;
  imageUrl: string;
  customizationOptions: CustomizationOptionInput[];
}

export interface CreateOrderRequest {
  orderNumber: number;
  tableNumber: number;
  waiterNumber: number;
  paymentMethod: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "MONEY";
  totalValue: number;
  restaurantId: string;
  origin?: OrderOrigin;
  deliveryZoneId?: string | null;
  address?: AddressInput;
  items: CreateOrderItem[];
}

/**
 * Creates an order placed by an unauthenticated caller (table QR code / guest checkout).
 *
 * Because this endpoint has no auth, nothing from the request is trusted for
 * pricing or tenancy: `restaurantId` and every `productId` are verified to
 * exist and belong together, and `totalValue` is always recomputed from the
 * catalog rather than accepted from the client (see RFC §"Order pricing trust
 * boundary" for the remaining caveat around customization option prices).
 */
export class CreateOrderService {
  /**
   * @throws {Error} for any validation failure (missing/invalid restaurant,
   * empty/invalid items, product not in this restaurant's catalog, or
   * inconsistent delivery-zone/address data) — the controller maps these to 400.
   */
  async execute(data: CreateOrderRequest) {
    if (!data.restaurantId || !/^[0-9a-fA-F]{24}$/.test(data.restaurantId)) {
      throw new Error("Invalid restaurantId");
    }

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("Items array is required");
    }

    for (const item of data.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        throw new Error("Each item requires a valid productId and a positive quantity");
      }
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: data.restaurantId },
    });

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: data.items.map((item) => item.productId) },
        category: { restaurantId: data.restaurantId },
      },
    });

    const productById = new Map(products.map((product) => [product.id, product]));

    for (const item of data.items) {
      if (!productById.has(item.productId)) {
        throw new Error(`Product ${item.productId} does not belong to this restaurant`);
      }
    }

    // Prices are always recomputed server-side from the catalog; client-supplied
    // totalValue/prices are never trusted.
    const totalValue = data.items.reduce((sum, item) => {
      const product = productById.get(item.productId)!;
      const customizationsTotal = (item.customizationOptions || []).reduce(
        (acc, opt) => acc + opt.additionalPrice * opt.quantity,
        0
      );
      return sum + (product.price + customizationsTotal) * item.quantity;
    }, 0);

    const origin: OrderOrigin = data.origin || "LOCAL";
    let deliveryFee: number | null = null;
    let estimatedDeliveryTime: number | null = null;
    let deliveryZoneId: string | null = null;
    let address: Prisma.InputJsonValue | null = null;

    if (origin === "DELIVERY") {
      if (!data.deliveryZoneId) {
        throw new Error("deliveryZoneId is required for delivery orders");
      }

      if (!data.address) {
        throw new Error("address is required for delivery orders");
      }

      const zone = await prisma.deliveryZone.findFirst({
        where: {
          id: data.deliveryZoneId,
          restaurantId: data.restaurantId,
          isActive: true,
        },
      });

      if (!zone) {
        throw new Error("Delivery zone not found for this restaurant");
      }

      deliveryFee = zone.deliveryFee;
      estimatedDeliveryTime = zone.estimatedTime || null;
      deliveryZoneId = zone.id;
      address = data.address as unknown as Prisma.InputJsonValue;
    } else {
      if (data.deliveryZoneId) {
        throw new Error("deliveryZoneId must be null when origin is not DELIVERY");
      }
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: String(data.orderNumber),
        status: "CREATED",
        origin,
        orderedAt: new Date(),
        tableNumber: String(data.tableNumber),
        waiterNumber: String(data.waiterNumber),
        totalValue,
        paymentMethod: data.paymentMethod,
        restaurantId: data.restaurantId,
        deliveryZoneId,
        deliveryFee,
        estimatedDeliveryTime,
        address,
        items: {
          create: data.items.map((item) => ({
            product: { connect: { id: item.productId } },
            quantity: item.quantity,
            imageUrl: item.imageUrl,
            observation: item.observation,
            ratingStar: item.ratingStar,
            customizations: {
              create: (item.customizationOptions || []).map((opt) => ({
                name: opt.name,
                additionalPrice: opt.additionalPrice,
                quantity: opt.quantity,
              })),
            },
          })),
        },
      },
    });

    return order;
  }
}

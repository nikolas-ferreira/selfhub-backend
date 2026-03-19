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

export class CreateOrderService {
  async execute(data: CreateOrderRequest) {
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error("Items array is required");
    }

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
        totalValue: data.totalValue,
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

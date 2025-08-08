import prisma from "../../shared/prisma";

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
  items: CreateOrderItem[];
}

export class CreateOrderService {
  async execute(data: CreateOrderRequest) {
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error("Items array is required");
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: data.orderNumber,
        status: "CREATED",
        orderedAt: new Date(),
        tableNumber: data.tableNumber,
        waiterNumber: data.waiterNumber,
        totalValue: data.totalValue,
        paymentMethod: data.paymentMethod,
        restaurantId: data.restaurantId,
        items: {
          create: data.items.map((item) => ({
            product: { connect: { id: item.productId } },
            quantity: item.quantity,
            imageUrl: item.imageUrl,
            observation: item.observation,
            ratingStar: item.ratingStar,
            customizations: {
              create: item.customizationOptions.map((opt) => ({
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

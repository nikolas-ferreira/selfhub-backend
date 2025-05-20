import prisma from "../../shared/prisma";

interface CreateOrderItem {
  productId: string;
  quantity: number;
}

interface CreateOrderRequest {
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
          })),
        },
      },
    });

    return order;
  }
}

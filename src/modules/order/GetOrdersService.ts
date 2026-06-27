import prisma from "../../shared/prisma"
import { OrderOrigin } from "./orderTypes"

interface GetOrdersRequest {
  restaurantId: string
  productId?: string
  origin?: OrderOrigin
}

/** Reads orders for a restaurant, with optional filtering by product or origin. Reused by {@link GetDeliveryOrdersController}. */
export class GetOrdersService {
  /**
   * Always scoped by `restaurantId`; `productId`/`origin` are additive filters.
   * Lets Prisma errors bubble up uncaught — the calling controller logs them
   * with full request context via `respondInternalError`.
   */
  async execute({ restaurantId, productId, origin }: GetOrdersRequest) {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        origin,
        items: productId ? { some: { productId } } : undefined
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        origin: true,
        orderedAt: true,
        preparedAt: true,
        deliveredAt: true,
        finishedAt: true,
        canceledAt: true,
        tableNumber: true,
        comandaId: true,
        comandaNumber: true,
        billId: true,
        waiterNumber: true,
        address: true,
        deliveryFee: true,
        estimatedDeliveryTime: true,
        totalValue: true,
        paymentMethod: true,
        customerId: true,
        customerName: true,
        customerCpf: true,
        customerPhone: true,
        deliveryZone: {
          select: {
            id: true,
            name: true,
            estimatedTime: true
          }
        },
        items: {
          select: {
            id: true,
            quantity: true,
            observation: true,
            ratingStar: true,
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                imageUrl: true
              }
            }
          }
        }
      },
      orderBy: { orderedAt: "desc" }
    })

    return orders
  }
}

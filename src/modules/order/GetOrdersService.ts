import prisma from "../../shared/prisma"
import { OrderOrigin } from "./orderTypes"

interface GetOrdersRequest {
  restaurantId: string
  productId?: string
  origin?: OrderOrigin
}

export class GetOrdersService {
  async execute({ restaurantId, productId, origin }: GetOrdersRequest) {
    try {
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
          waiterNumber: true,
          address: true,
          deliveryFee: true,
          estimatedDeliveryTime: true,
          totalValue: true,
          paymentMethod: true,
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
    } catch (error) {
      console.error("Failed to fetch orders from database", error)
      throw error
    }
  }
}

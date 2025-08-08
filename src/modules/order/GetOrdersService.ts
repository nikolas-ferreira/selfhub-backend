import prisma from "../../shared/prisma"

interface GetOrdersRequest {
  restaurantId: string
  productId?: string
}

export class GetOrdersService {
  async execute({ restaurantId, productId }: GetOrdersRequest) {
    try {
      const orders = await prisma.order.findMany({
        where: {
          restaurantId,
          items: productId ? { some: { productId } } : undefined
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          orderedAt: true,
          preparedAt: true,
          deliveredAt: true,
          finishedAt: true,
          canceledAt: true,
          tableNumber: true,
          waiterNumber: true,
          totalValue: true,
          paymentMethod: true,
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

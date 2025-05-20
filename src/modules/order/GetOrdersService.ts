import prisma from "../../shared/prisma"

interface GetOrdersRequest {
  restaurantId: string
  productId?: string
}

export class GetOrdersService {
  async execute({ restaurantId, productId }: GetOrdersRequest) {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        items: productId ? {
          some: { productId }
        } : undefined
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: {
        orderedAt: "desc"
      }
    })

    return orders
  }
}

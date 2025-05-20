import prisma from "../../shared/prisma";
import { OrderStatus } from './OrderStatus'


interface EditOrderStatusParams {
  orderId: string
  status: OrderStatus
  restaurantId: string
}

export class EditOrderStatusService {
  async execute({ orderId, status, restaurantId }: EditOrderStatusParams) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId
      }
    })

    if (!order) {
      throw new Error('Order not found')
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status }
    })

    return updatedOrder
  }
}

import prisma from "../../shared/prisma";
import { OrderStatus } from './OrderStatus'
import { OrderNotificationService } from '../notification/OrderNotificationService'


interface EditOrderStatusParams {
  orderId: string
  status: OrderStatus
  restaurantId: string
}

const TERMINAL_STATUSES: OrderStatus[] = [OrderStatus.FINISHED, OrderStatus.CANCELED]

/** Updates an order's status, scoped to the caller's restaurant. */
export class EditOrderStatusService {
  /**
   * @throws {Error} "Order not found" if the order doesn't exist or belongs
   * to another restaurant; "Order is already X" if it's already in a
   * terminal state ({@link TERMINAL_STATUSES}).
   */
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

    if (TERMINAL_STATUSES.includes(order.status as OrderStatus)) {
      throw new Error(`Order is already ${order.status} and cannot be updated`)
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status }
    })

    // Fire-and-forget, same reasoning as CreateOrderService — see OrderNotificationService.
    void new OrderNotificationService().notifyStatusChanged(updatedOrder, status)

    return updatedOrder
  }
}

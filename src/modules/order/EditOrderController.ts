import { FastifyRequest, FastifyReply } from 'fastify'
import { EditOrderStatusService } from './EditOrderService'
import { OrderStatus } from './OrderStatus'

interface EditOrderStatusBody {
  status: OrderStatus
}

interface AuthenticatedUser {
  id: string
  role: 'WAITER' | 'MANAGER' | 'ADMIN'
  restaurantId: string
}

/** HTTP layer for `PATCH /orders/:id` (status transitions). Restricted to ADMIN/MANAGER. */
export class EditOrderStatusController {
  /** Validates the caller's role and that `status` is a known {@link OrderStatus} before delegating. */
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { id: orderId } = request.params as { id: string }
    const { status } = request.body as EditOrderStatusBody
    const user = request.user as AuthenticatedUser

    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        response: null,
        message: 'Permission denied'
      })
    }

    if (!status || !Object.values(OrderStatus).includes(status)) {
      return reply.status(400).send({
        statusCode: 400,
        response: null,
        message: 'Invalid order status'
      })
    }

    // FINISHED must only happen through the cashier's payment flow
    // (`POST /bills/:id/close`), which checks the bill is fully paid before
    // finalizing the orders. This endpoint is a manual override — restricted
    // to ADMIN — for the rest of the status flow only.
    if (status === OrderStatus.FINISHED && user.role !== 'ADMIN') {
      return reply.status(403).send({
        statusCode: 403,
        response: null,
        message: 'Apenas o caixa (ao registrar o pagamento) ou um administrador podem finalizar um pedido.'
      })
    }

    try {
      const service = new EditOrderStatusService()
      const updatedOrder = await service.execute({
        orderId,
        status,
        restaurantId: user.restaurantId
      })

      return reply.status(200).send({
        statusCode: 200,
        response: updatedOrder
      })
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        response: null,
        message: err.message
      })
    }
  }
}

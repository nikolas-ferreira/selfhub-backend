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

export class EditOrderStatusController {
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

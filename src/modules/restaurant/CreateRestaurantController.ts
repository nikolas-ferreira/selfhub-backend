import { FastifyRequest, FastifyReply } from "fastify";
import { CreateRestautantService } from './CreateRestaurantService'

class CreateRestaurantController {
    async handle(request: FastifyRequest, reply: FastifyReply) {
        const { name } = request.body as { name: string }

        const restaurantService = new CreateRestautantService()
        const restaurant = await restaurantService.execute({ name });

        reply.send(restaurant)
    }
}

export { CreateRestaurantController }
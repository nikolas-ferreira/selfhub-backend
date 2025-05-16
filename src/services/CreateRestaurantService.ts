import prismaClient from "../prisma";

interface CreateRestaurantProps {
    name: string
}

class CreateRestautantService {
    async execute({ name }: CreateRestaurantProps) {
        // todo validações

        const restaurant = await prismaClient.restaurant.create({
            data: {
                name
            }
        })

        return restaurant
    }
}

export { CreateRestautantService }
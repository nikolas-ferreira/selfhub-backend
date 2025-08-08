import prismaClient from "../../shared/prisma";

interface CreateRestaurantProps {
  name: string;
}

class CreateRestautantService {
  async execute({ name }: CreateRestaurantProps) {
    const sanitizedName = name.trim().replace(/[<>]/g, "");

    const restaurant = await prismaClient.restaurant.create({
      data: {
        name: sanitizedName,
      },
    });

    return restaurant;
  }
}

export { CreateRestautantService };
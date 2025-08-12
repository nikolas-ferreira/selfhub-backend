import prismaClient from "../../shared/prisma";

interface CreateRestaurantProps {
  name: string;
  cnpj: string;
}

class CreateRestautantService {
  async execute({ name, cnpj }: CreateRestaurantProps) {
    const sanitizedName = name.trim().replace(/[<>]/g, "");
    const sanitizedCnpj = cnpj.replace(/\D/g, "");

    const restaurant = await prismaClient.restaurant.create({
      data: {
        name: sanitizedName,
        cnpj: sanitizedCnpj,
      },
    });

    return restaurant;
  }
}

export { CreateRestautantService };
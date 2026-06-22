import prismaClient from "../../shared/prisma";

interface CreateRestaurantProps {
  name: string;
  cnpj: string;
}

/** Creates restaurant records. Authorization (ADMIN-only) is enforced by the controller. */
class CreateRestautantService {
  /** Sanitizes `name`/`cnpj` and persists a new restaurant. `cnpj` must be globally unique. */
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